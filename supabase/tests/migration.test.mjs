import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const stub = `
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;
`;
await db.exec(stub);
// Simulate a project that already hosts another app (the website) with clashing names in public
await db.exec(`create type public.app_role as enum ('admin','editor'); create table public.profiles(id uuid primary key, role public.app_role); create table public.audit_logs(id int); create table public.system_settings(k text);
  create function public.handle_new_user() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();`);
await db.exec(fs.readFileSync(process.argv[2], 'utf8'));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated; grant usage on all sequences in schema public to authenticated;`);
// a second run proves idempotency
await db.exec(fs.readFileSync(process.argv[2], 'utf8'));
console.log('migration applied twice OK');

let pass = 0, fail = 0;
const ok = (n, c) => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const as = async (uid) => { await db.exec(`reset role; select set_config('request.jwt.sub','${uid ?? ''}',false); set role authenticated;`); };
const su = async () => db.exec(`reset role;`);
const throws = async (fn, re) => { try { await fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

const mk = async (email, role) => {
  const r = await db.query(`insert into auth.users(email) values ('${email}') returning id`);
  const id = r.rows[0].id;
  await db.exec(`update cwems.profiles set role='${role}' where id='${id}'`); // as superuser (trigger allows? check)
  return id;
};
// superuser has no auth.uid -> guard trigger would block role change; set a temp admin first
await db.query(`insert into auth.users(email) values ('admin@x')`);
await db.query(`select cwems.add_staff('admin@x','Admin','system_admin')`);
const stranger = (await db.query(`insert into auth.users(email) values ('website-visitor@x') returning id`)).rows[0].id;
const ids = {};
for (const [e, r] of [['fo1','field_officer'],['fo2','field_officer'],['coord','programme_coordinator'],['dir','director'],['fin','finance_officer'],['me','me_officer']]) {
  await db.query(`insert into auth.users(email) values ('${e}@x')`);
  ids[e] = (await db.query(`select cwems.add_staff('${e}@x','${e}','${r}') as id`)).rows[0].id;
}
const reg = (nrc, name='Test Widow', extra={}) => db.query(`select cwems.register_beneficiary($1::jsonb) as r`, [JSON.stringify({ full_name:name, nrc, approx_age:55, province:'Copperbelt', district:'Chingola', community:'Nchanga', household_size:5, ...extra })]);

// new users default to least privilege
ok('website sign-up gets NO cwems profile', (await db.query(`select count(*)::int c from cwems.profiles where id='${stranger}'`)).rows[0].c === 0);
ok('existing public.app_role/profiles untouched', (await db.query(`select count(*)::int c from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='app_role' and t.typnamespace='public'::regnamespace`)).rows[0].c === 2);
await as(stranger);
ok('website user cannot register a widow', await throws(() => reg('999999/99/9'), /Not permitted/));
ok('website user sees no beneficiaries', (await db.query(`select count(*)::int c from cwems.beneficiaries`)).rows[0].c === 0);
ok('website user sees no audit/profiles-based access', (await db.query(`select count(*)::int c from cwems.audit_logs`)).rows[0].c === 0);
await su();

await as(ids.fo1);
let r1 = await reg('123456/12/1', 'Mary Phiri');
ok('field officer can register a widow', r1.rows[0].r.beneficiary_no.startsWith('CWM-' + new Date().getFullYear() + '-001'));
let r2 = await reg('654321/10/1', 'Grace Banda');
ok('IDs continue automatically (002)', r2.rows[0].r.beneficiary_no.endsWith('-002'));
ok('exact duplicate NRC refused', await throws(() => reg('123456/12/1', 'Someone Else'), /DUPLICATE_NRC/));
ok('duplicate NRC refused even if typed as 123456121', await throws(() => reg('123456121', 'Other'), /DUPLICATE_NRC/));
ok('duplicate NRC refused with spaces/dashes 123456-12-1', await throws(() => reg('123456-12-1', 'Other'), /DUPLICATE_NRC/));
ok('invalid NRC refused', await throws(() => reg('12345/1/1'), /Invalid NRC/));
ok('refused duplicate did not burn/skip an ID', (await reg('111111/11/1')).rows[0].r.beneficiary_no.endsWith('-003'));
ok('nrc_exists true for existing', (await db.query(`select cwems.nrc_exists('123456/12/1') v`)).rows[0].v === true);

// DB-level guard even bypassing the RPC (as superuser)
await su();
const bid = r1.rows[0].r.id;
ok('unique index blocks direct duplicate insert', await throws(() => db.query(`insert into cwems.beneficiary_identifiers(beneficiary_id,nrc_display,nrc_normalised) select id,'x','123456121' from cwems.beneficiaries where id<>'${bid}' limit 1`), /nrc_unique|duplicate/));

// RLS
await as(ids.fo2);
ok('other field officer cannot see fo1 beneficiaries', (await db.query(`select count(*)::int c from cwems.beneficiaries`)).rows[0].c === 0);
await as(ids.fo1);
ok('field officer sees own 3', (await db.query(`select count(*)::int c from cwems.beneficiaries`)).rows[0].c === 3);
ok('field officer cannot read NRCs', (await db.query(`select count(*)::int c from cwems.beneficiary_identifiers`)).rows[0].c === 0);
ok('field officer cannot insert directly into beneficiaries', await throws(() => db.query(`insert into cwems.beneficiaries(beneficiary_no,full_name,approx_age,province,district,community) values ('CWM-X','x y',40,'a','b','c')`)));
ok('field officer cannot hard delete (0 rows affected, all 3 remain)', (await db.query(`delete from cwems.beneficiaries`)).affectedRows === 0 && (await db.query(`select count(*)::int c from cwems.beneficiaries`)).rows[0].c === 3);
ok('field officer cannot read audit log', (await db.query(`select count(*)::int c from cwems.audit_logs`)).rows[0].c === 0);
ok('field officer cannot promote self', await throws(() => db.query(`update cwems.profiles set role='director' where id='${ids.fo1}'`), /administrator/));
await as(ids.coord);
ok('coordinator sees all 3', (await db.query(`select count(*)::int c from cwems.beneficiaries`)).rows[0].c === 3);
ok('coordinator can read NRCs', (await db.query(`select count(*)::int c from cwems.beneficiary_identifiers`)).rows[0].c === 3);
await as(ids.fin);
ok('finance officer cannot register', await throws(() => reg('222222/22/2'), /Not permitted/));
ok('finance officer cannot read NRCs', (await db.query(`select count(*)::int c from cwems.beneficiary_identifiers`)).rows[0].c === 0);

// corrections need a reason and are audited with old/new
await as(ids.coord);
ok('correction without reason refused', await throws(() => db.query(`select cwems.correct_beneficiary('${bid}','{"community":"Kabundi"}','')`), /reason/i));
await db.query(`select cwems.correct_beneficiary('${bid}','{"community":"Kabundi"}','Moved house')`);
await as(ids.dir);
ok('director can read audit log', (await db.query(`select count(*)::int c from cwems.audit_logs`)).rows[0].c > 0);
const a = (await db.query(`select old_value->>'community' o, new_value->>'community' n, reason, user_id from cwems.audit_logs where table_name='beneficiaries' and action='UPDATE' order by id desc limit 1`)).rows[0];
ok('audit has old, new, reason, user', a.o==='Nchanga' && a.n==='Kabundi' && a.reason==='Moved house' && a.user_id===ids.coord);
ok('audit log cannot be edited by a user (0 rows affected)', (await db.query(`update cwems.audit_logs set reason='x'`)).affectedRows === 0);
await su();
ok('audit log immutable even for superuser', await throws(() => db.query(`delete from cwems.audit_logs`), /append-only/));
ok('field officer cannot correct', await (async()=>{ await as(ids.fo1); return throws(() => db.query(`select cwems.correct_beneficiary('${bid}','{"community":"X"}','r')`), /Not permitted/); })());

// enrolment: one per cohort, approver must differ from requester
await su();
const coh = (await db.query(`insert into cwems.programme_cohorts(name,start_date) values ('Cohort 1','2026-12-01') returning id, end_date`)).rows[0];
ok('6-month dates generated (01/12/2026 -> 31/05/2027)', String(coh.end_date).includes('2027-05-31') || new Date(coh.end_date).toISOString().startsWith('2027-05-31'));
await as(ids.coord);
await db.query(`insert into cwems.enrolments(beneficiary_id,cohort_id,requested_by) values ('${bid}','${coh.id}','${ids.coord}')`);
ok('duplicate enrolment in same cohort refused', await throws(() => db.query(`insert into cwems.enrolments(beneficiary_id,cohort_id,requested_by) values ('${bid}','${coh.id}','${ids.coord}')`), /one_enrolment/));
ok('coordinator cannot approve enrolment', (await db.query(`update cwems.enrolments set status='approved', approved_by='${ids.dir}'`)).affectedRows === 0);
await as(ids.dir);
ok('director can approve enrolment', (await db.query(`update cwems.enrolments set status='approved', approved_by='${ids.dir}'`)).affectedRows === 1);
await as(ids.fo1);
const dc = (await db.query(`select registered from cwems.v_dashboard_counts`)).rows[0];
ok('dashboard count respects RLS (fo1 sees 3)', dc.registered === 3);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
