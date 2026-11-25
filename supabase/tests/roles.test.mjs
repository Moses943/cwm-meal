import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;`);
await db.exec(read('migrations/0002_cwems_schema.sql'));

let pass = 0, fail = 0;
const ok = (n, c) => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n); };
const as = async uid => { await db.exec(`reset role; select set_config('request.jwt.sub','${uid ?? ''}',false); set role authenticated;`); };
const su = () => db.exec('reset role;');
const throws = async (fn, re) => { try { await fn(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const user = async (email, role) => { await db.query(`insert into auth.users(email) values ('${email}')`); return (await db.query(`select cwems.add_staff('${email}','${email}','${role}') id`)).rows[0].id; };

// --- BEFORE: the database as it is today (old role names) with an existing admin and one old-role user
const admin = await user('admin@x', 'system_admin');
const oldFo = await user('oldfo@x', 'field_officer');
const oldFin = await user('oldfin@x', 'finance_officer');

// --- UPGRADE
await db.exec(read('3a-roles-step1.sql'));
await db.exec(read('3b-roles-step2.sql'));
await db.exec(read('3b-roles-step2.sql'));   // idempotent re-run
await db.exec(read('4-founder-view-all-director-manages-users.sql'));
await db.exec(read('4-founder-view-all-director-manages-users.sql'));
await db.exec(read('5-director-full-rights.sql'));
await db.exec(read('5-director-full-rights.sql'));
console.log('upgrade applied (3b run twice)');

const roleOf = async id => (await db.query(`select role::text r from cwems.profiles where id='${id}'`)).rows[0].r;
ok('existing admin unchanged', await roleOf(admin) === 'system_admin');
ok('old field_officer user converted to secretary', await roleOf(oldFo) === 'secretary');
ok('old finance_officer user converted to accounts_officer', await roleOf(oldFin) === 'accounts_officer');
const labels = (await db.query(`select role::text r from cwems.roles order by 1`)).rows.map(x => x.r);
ok('exactly 7 positions + administrator', JSON.stringify(labels) === JSON.stringify(['accounts_officer','co_founder','founder','me_officer','project_coordinator','project_director','secretary','system_admin']));
ok('role is now required when adding staff', await throws(() => db.query(`insert into cwems.profiles(id,full_name) values (gen_random_uuid(),'x')`)));

const ids = { admin, secretary: oldFo, accounts: oldFin };
ids.founder = await user('founder@x', 'founder');
ids.cofounder = await user('cofounder@x', 'co_founder');
ids.director = await user('director@x', 'project_director');
ids.coord = await user('coord@x', 'project_coordinator');
ids.me = await user('me@x', 'me_officer');
const stranger = (await db.query(`insert into auth.users(email) values ('web@x') returning id`)).rows[0].id;

const reg = (nrc, name = 'Test Widow') => db.query(`select cwems.register_beneficiary($1::jsonb) r`, [JSON.stringify({ full_name: name, nrc, approx_age: 55, province: 'Copperbelt', district: 'Chingola', community: 'Nchanga' })]);
const count = async t => (await db.query(`select count(*)::int c from cwems.${t}`)).rows[0].c;

// registration rights
await as(ids.secretary); const a = await reg('123456/12/1', 'Mary Phiri');
ok('Secretary can register (ID CWM-yyyy-001)', /-001$/.test(a.rows[0].r.beneficiary_no));
ok('Secretary: duplicate NRC refused', await throws(() => reg('123456121'), /DUPLICATE_NRC/));
await as(ids.coord); const b = await reg('654321/10/1', 'Grace Banda');
ok('Project Coordinator can register (002)', /-002$/.test(b.rows[0].r.beneficiary_no));
for (const r of ['founder', 'cofounder', 'accounts', 'me', 'admin']) {
  await as(ids[r]);
  ok(`${r} cannot register`, await throws(() => reg('999999/99/' + Math.floor(Math.random() * 9)), /Not permitted/));
}

// visibility
for (const r of ['founder', 'cofounder', 'director', 'coord', 'secretary', 'accounts', 'me']) { await as(ids[r]); ok(`${r} sees both beneficiaries`, await count('beneficiaries') === 2); }
await as(ids.admin); ok('administrator sees no beneficiary records', await count('beneficiaries') === 0);
await as(stranger); ok('website/other user sees nothing', await count('beneficiaries') === 0);
for (const r of ['founder', 'cofounder', 'director', 'coord', 'secretary']) { await as(ids[r]); ok(`${r} can read NRCs`, await count('beneficiary_identifiers') === 2); }
for (const r of ['accounts', 'me', 'admin']) { await as(ids[r]); ok(`${r} cannot read NRCs`, await count('beneficiary_identifiers') === 0); }

// audit visibility
for (const r of ['founder', 'cofounder', 'director', 'me', 'admin']) { await as(ids[r]); ok(`${r} can read audit log`, await count('audit_logs') > 0); }
for (const r of ['coord', 'secretary', 'accounts']) { await as(ids[r]); ok(`${r} cannot read audit log`, await count('audit_logs') === 0); }

// corrections
await as(ids.secretary);
await db.query(`select cwems.correct_beneficiary('${a.rows[0].r.id}','{"community":"Kabundi"}','Moved house')`);
ok('Secretary can correct a record with a reason', true);
await as(ids.founder);
ok('Founder cannot correct records', await throws(() => db.query(`select cwems.correct_beneficiary('${a.rows[0].r.id}','{"community":"X"}','r')`), /Not permitted/));

// enrolment approval separation
await su();
const coh = (await db.query(`insert into cwems.programme_cohorts(name,start_date) values ('Cohort 1','2026-12-01') returning id`)).rows[0].id;
await as(ids.coord);
await db.query(`insert into cwems.enrolments(beneficiary_id,cohort_id,requested_by) values ('${a.rows[0].r.id}','${coh}','${ids.coord}')`);
ok('Coordinator cannot approve enrolment', (await db.query(`update cwems.enrolments set status='approved', approved_by='${ids.director}'`)).affectedRows === 0);
await as(ids.secretary);
ok('Secretary cannot request enrolment', await throws(() => db.query(`insert into cwems.enrolments(beneficiary_id,cohort_id,requested_by) values ('${b.rows[0].r.id}','${coh}','${ids.secretary}')`)));
await as(ids.director);
ok('Project Director can approve enrolment', (await db.query(`update cwems.enrolments set status='approved', approved_by='${ids.director}'`)).affectedRows === 1);

// admin powers
await as(ids.admin);
ok('Administrator can change a role', (await db.query(`update cwems.profiles set role='me_officer' where id='${ids.me}'`)).affectedRows === 1);
await as(ids.secretary);
ok('Secretary cannot promote themselves', await throws(() => db.query(`update cwems.profiles set role='project_director' where id='${ids.secretary}'`), /not allowed/));
await as(ids.director);
ok('Project Director cannot change their own role', await throws(() => db.query(`update cwems.profiles set role='founder' where id='${ids.director}'`), /own role/));
// --- Director adds staff
await su();
const su1 = (await db.query(`insert into auth.users(email, raw_user_meta_data) values ('new1@x','{"app":"cwems","full_name":"New Person"}') returning id`)).rows[0].id;
await db.query(`insert into auth.users(email, raw_user_meta_data) values ('websiteadmin@x','{"app":"website"}')`);
await as(ids.director);
const pend = (await db.query(`select * from cwems.pending_signups()`)).rows;
ok('Director sees pending CWEMS sign-ups only (not website accounts)', pend.length === 1 && pend[0].email === 'new1@x');
await db.query(`select cwems.grant_role('new1@x','New Person','secretary')`);
ok('Director can give a role to a signed-up person', (await db.query(`select role::text r from cwems.profiles where id='${su1}'`)).rows[0].r === 'secretary');
ok('Pending list is empty after granting', (await db.query(`select * from cwems.pending_signups()`)).rows.length === 0);
ok('Director can grant the Administrator role', (await db.query(`select cwems.grant_role('new1@x','New Person','system_admin')`)).rows.length === 1);
ok('Director cannot grant a role to themselves', await throws(() => db.query(`select cwems.grant_role('director@x','D','founder')`), /own role/));
ok('Director has every permission', (await db.query(`select (select count(*) from cwems.permissions) = (select count(*) from cwems.role_permissions where role='project_director') as v`)).rows[0].v === true);
ok('Director cannot grant to an unknown email', await throws(() => db.query(`select cwems.grant_role('nobody@x','N','secretary')`), /No account/));
ok('Director can deactivate a staff member', (await db.query(`update cwems.profiles set is_active=false where id='${su1}'`)).affectedRows === 1);
await as(su1);
ok('Deactivated staff member sees no beneficiaries', await count('beneficiaries') === 0);
for (const r of ['secretary', 'coord', 'accounts', 'me', 'founder', 'cofounder']) { await as(ids[r]);
  ok(`${r} cannot grant roles`, await throws(() => db.query(`select cwems.grant_role('new1@x','N','secretary')`), /Not permitted/));
  ok(`${r} cannot list pending sign-ups`, await throws(() => db.query(`select * from cwems.pending_signups()`), /Not permitted/)); }
await as(ids.admin);
ok('Administrator can grant Administrator', (await db.query(`select cwems.grant_role('new1@x','New Person','system_admin')`)).rows.length === 1);
await db.exec(`select set_config('cwems.reason','',false)`);
// Director: full rights, but cannot approve own request
await su();
await as(ids.director);
const d1 = await reg('777777/77/7', 'Director Registered');
ok('Project Director can register beneficiaries', /-003$/.test(d1.rows[0].r.beneficiary_no));
await db.query(`insert into cwems.enrolments(beneficiary_id,cohort_id,requested_by) values ('${b.rows[0].r.id}','${coh}','${ids.director}')`);
ok('Director can request enrolment', true);
ok('Director cannot approve their own enrolment request', await throws(() => db.query(`update cwems.enrolments set status='approved', approved_by='${ids.director}' where beneficiary_id='${b.rows[0].r.id}'`), /approver_not_requester|violates/));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
