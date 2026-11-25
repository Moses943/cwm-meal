-- =====================================================================
-- CWEMS  |  Migration 0001  |  Foundation + Beneficiary Registration
-- Cornerstone Widows Ministry – Empowerment & Monitoring System
-- Target: Supabase Postgres. Idempotent where practical.
-- =====================================================================

-- gen_random_uuid() is built into Postgres 13+, so no extension is required.
-- Everything lives in its own schema so it never collides with other apps in the same Supabase project.
create schema if not exists cwems;
grant usage on schema cwems to authenticated;

-- ---------------------------------------------------------------------
-- 1. Roles and permissions
-- ---------------------------------------------------------------------
do $$ begin
  create type cwems.app_role as enum
    ('director','programme_coordinator','me_officer','field_officer',
     'training_officer','finance_officer','system_admin');
exception when duplicate_object then null; end $$;

create table if not exists cwems.roles (
  role cwems.app_role primary key,
  label text not null,
  description text
);

create table if not exists cwems.permissions (
  code text primary key,
  description text
);

create table if not exists cwems.role_permissions (
  role cwems.app_role references cwems.roles(role) on delete cascade,
  permission text references cwems.permissions(code) on delete cascade,
  primary key (role, permission)
);

insert into cwems.roles(role,label,description) values
 ('director','Director','Oversight; approves enrolment, finance, reports, graduation'),
 ('programme_coordinator','Programme Coordinator','Implementation, enrolment requests, training and field activities'),
 ('me_officer','M&E Officer','Questionnaires, assessments, verification, indicators, reports'),
 ('field_officer','Field Officer','Registers assigned beneficiaries, follow-ups, testimonials'),
 ('training_officer','Training Officer','Training topics, attendance, assessments'),
 ('finance_officer','Finance Officer','Records distributions and expenditure; cannot approve'),
 ('system_admin','System Administrator','Users, permissions, settings, backups; no programme approvals')
on conflict (role) do nothing;

insert into cwems.permissions(code,description) values
 ('beneficiary.register','Register a beneficiary'),
 ('beneficiary.view_all','View all beneficiaries'),
 ('beneficiary.view_assigned','View beneficiaries assigned to self'),
 ('beneficiary.view_nrc','View NRC numbers'),
 ('beneficiary.update','Correct beneficiary information (audited)'),
 ('enrolment.request','Request / perform enrolment'),
 ('enrolment.approve','Approve enrolment'),
 ('finance.record','Record financial distributions'),
 ('finance.approve','Approve financial transactions'),
 ('training.manage','Manage training and attendance'),
 ('me.manage','Manage questionnaires, indicators, verification'),
 ('report.approve','Approve final reports'),
 ('graduation.approve','Approve graduation and certificates'),
 ('users.manage','Manage users and permissions'),
 ('settings.manage','Manage system settings and backups'),
 ('audit.view','View audit logs')
on conflict (code) do nothing;

insert into cwems.role_permissions(role,permission) values
 -- Director: oversight and approvals, sees everything
 ('director','beneficiary.view_all'),('director','beneficiary.view_nrc'),('director','enrolment.approve'),
 ('director','finance.approve'),('director','report.approve'),('director','graduation.approve'),('director','audit.view'),
 -- Coordinator
 ('programme_coordinator','beneficiary.register'),('programme_coordinator','beneficiary.view_all'),
 ('programme_coordinator','beneficiary.view_nrc'),('programme_coordinator','beneficiary.update'),
 ('programme_coordinator','enrolment.request'),('programme_coordinator','training.manage'),
 -- M&E
 ('me_officer','beneficiary.view_all'),('me_officer','me.manage'),('me_officer','audit.view'),
 -- Field officer
 ('field_officer','beneficiary.register'),('field_officer','beneficiary.view_assigned'),
 -- Training officer
 ('training_officer','beneficiary.view_all'),('training_officer','training.manage'),
 -- Finance officer: records only (separation of duties: no finance.approve)
 ('finance_officer','beneficiary.view_all'),('finance_officer','finance.record'),
 -- Admin: system only; deliberately NO programme approvals
 ('system_admin','users.manage'),('system_admin','settings.manage'),('system_admin','audit.view')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------
create table if not exists cwems.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  role cwems.app_role not null default 'field_officer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Staff are added explicitly (SQL editor or later the admin screen). There is NO trigger on auth.users,
-- so other apps' sign-ups (e.g. the public website) never get access to CWEMS.
create or replace function cwems.add_staff(p_email text, p_full_name text, p_role cwems.app_role) returns uuid
language plpgsql security definer set search_path = cwems as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then raise exception 'No auth user with email %. Create the user in Authentication > Users first.', p_email; end if;
  insert into cwems.profiles(id, full_name, email, role) values (v_id, p_full_name, p_email, p_role)
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, is_active = true;
  return v_id;
end $$;
revoke all on function cwems.add_staff(text,text,cwems.app_role) from public, anon, authenticated;

-- Permission helpers (security definer so RLS policies can call them)
create or replace function cwems.current_role_name() returns cwems.app_role
language sql stable security definer set search_path = cwems as $$
  select role from cwems.profiles where id = auth.uid() and is_active
$$;

create or replace function cwems.has_permission(p text) returns boolean
language sql stable security definer set search_path = cwems as $$
  select exists (
    select 1 from cwems.profiles pr
    join cwems.role_permissions rp on rp.role = pr.role
    where pr.id = auth.uid() and pr.is_active and rp.permission = p)
$$;

-- Signed-in users may not change roles or activation unless they are administrators.
-- (Server-side/SQL-editor changes, where auth.uid() is null, are allowed.)
create or replace function cwems.guard_profile_update() returns trigger
language plpgsql security definer set search_path = cwems as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and auth.uid() is not null and not cwems.has_permission('users.manage') then
    raise exception 'Only a system administrator can change roles or activation';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_guard_profile on cwems.profiles;
create trigger trg_guard_profile before update on cwems.profiles
  for each row execute function cwems.guard_profile_update();

-- ---------------------------------------------------------------------
-- 3. Settings, cohorts
-- ---------------------------------------------------------------------
create table if not exists cwems.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into cwems.system_settings(key,value) values
 ('organisation_name','"Cornerstone Widows Ministry"'),
 ('monthly_support_zmw','500'),
 ('programme_months','6'),
 ('currency','"ZMW"')
on conflict (key) do nothing;

create table if not exists cwems.programme_cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  target_beneficiaries int not null default 20 check (target_beneficiaries > 0),
  start_date date not null,
  duration_months int not null default 6 check (duration_months > 0),
  end_date date generated always as ((start_date + make_interval(months => duration_months) - interval '1 day')::date) stored,
  extension_months int not null default 0 check (extension_months >= 0),  -- approved programme extensions
  monthly_support_zmw numeric(12,2) not null default 500,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Beneficiaries
-- ---------------------------------------------------------------------
-- Atomic yearly counter for CWM-YYYY-NNN
create table if not exists cwems.beneficiary_counters (
  year int primary key,
  last_value int not null default 0
);

create or replace function cwems.next_beneficiary_no(p_year int) returns text
language plpgsql security definer set search_path = cwems as $$
declare v int;
begin
  insert into cwems.beneficiary_counters(year,last_value) values (p_year,1)
  on conflict (year) do update set last_value = beneficiary_counters.last_value + 1
  returning last_value into v;
  return 'CWM-' || p_year::text || '-' || lpad(v::text, 3, '0');
end $$;
revoke all on function cwems.next_beneficiary_no(int) from public, anon, authenticated;

create table if not exists cwems.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  beneficiary_no text not null unique,
  full_name text not null check (length(btrim(full_name)) > 1),
  date_of_birth date,
  approx_age int check (approx_age between 15 and 120),
  phone text,
  alt_contact text,
  province text not null,
  district text not null,
  community text not null,
  number_of_children int not null default 0 check (number_of_children >= 0),
  number_of_dependants int not null default 0 check (number_of_dependants >= 0),
  education_background text,
  employment_status text,
  income_sources text,
  existing_business text,
  skills text,
  business_interests text,
  registration_date date not null default current_date,
  assigned_field_officer uuid references cwems.profiles(id),
  status text not null default 'registered'
    check (status in ('mobilised','registered','enrolled','active','graduated','post_graduation','withdrawn')),
  is_archived boolean not null default false,       -- soft delete only
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_of_birth is not null or approx_age is not null)
);
create index if not exists idx_ben_officer on cwems.beneficiaries(assigned_field_officer);
create index if not exists idx_ben_geo on cwems.beneficiaries(province,district,community);
create index if not exists idx_ben_name on cwems.beneficiaries(lower(full_name));

-- NRC lives in its own table with stricter RLS and a UNIQUE normalised value.
-- Zambian NRC: 6 digits / 2 digits / 1 digit  e.g. 123456/12/1  -> normalised "123456121"
create table if not exists cwems.beneficiary_identifiers (
  beneficiary_id uuid primary key references cwems.beneficiaries(id) on delete cascade,
  nrc_display text not null,
  nrc_normalised text not null,
  created_at timestamptz not null default now(),
  constraint nrc_format check (nrc_normalised ~ '^[0-9]{9}$'),
  constraint nrc_unique unique (nrc_normalised)      -- THE duplicate-NRC guard, enforced by the database
);

create table if not exists cwems.beneficiary_households (
  beneficiary_id uuid primary key references cwems.beneficiaries(id) on delete cascade,
  household_size int check (household_size >= 1),
  children_in_school int check (children_in_school >= 0),
  housing_notes text,
  main_income_source text,
  updated_at timestamptz not null default now()
);

create table if not exists cwems.consent_records (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references cwems.beneficiaries(id),
  consent_type text not null check (consent_type in ('data_collection','photography','testimonial_public','testimonial_private')),
  granted boolean not null,
  recorded_by uuid references auth.users(id) default auth.uid(),
  recorded_at timestamptz not null default now(),
  notes text
);

create table if not exists cwems.enrolments (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references cwems.beneficiaries(id),
  cohort_id uuid not null references cwems.programme_cohorts(id),
  status text not null default 'requested' check (status in ('requested','approved','rejected','withdrawn')),
  enrolment_date date,
  programme_start date,
  programme_end date,
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint one_enrolment_per_cohort unique (beneficiary_id, cohort_id),
  constraint approver_not_requester check (approved_by is null or approved_by is distinct from requested_by)
);

-- ---------------------------------------------------------------------
-- 5. Audit log (append-only)
-- ---------------------------------------------------------------------
create table if not exists cwems.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid,
  action text not null,                 -- INSERT / UPDATE / DELETE / custom
  table_name text not null,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  approval_status text
);

create or replace function cwems.audit_trigger() returns trigger
language plpgsql security definer set search_path = cwems as $$
declare rid text; o jsonb; n jsonb;
begin
  if tg_op = 'DELETE' then o := to_jsonb(old); n := null; rid := coalesce(o->>'id', o->>'beneficiary_id');
  elsif tg_op = 'INSERT' then o := null; n := to_jsonb(new); rid := coalesce(n->>'id', n->>'beneficiary_id');
  else o := to_jsonb(old); n := to_jsonb(new); rid := coalesce(n->>'id', n->>'beneficiary_id'); end if;
  insert into cwems.audit_logs(user_id,action,table_name,record_id,old_value,new_value,reason)
  values (auth.uid(), tg_op, tg_table_name, rid, o, n, nullif(current_setting('cwems.reason', true), ''));
  return coalesce(new, old);
end $$;

create or replace function cwems.block_audit_change() returns trigger language plpgsql as $$
begin raise exception 'Audit logs are append-only'; end $$;
drop trigger if exists trg_audit_immutable on cwems.audit_logs;
create trigger trg_audit_immutable before update or delete on cwems.audit_logs
  for each row execute function cwems.block_audit_change();

do $$ declare t text; begin
  foreach t in array array['beneficiaries','beneficiary_identifiers','beneficiary_households','consent_records','enrolments','profiles','programme_cohorts','system_settings']
  loop
    execute format('drop trigger if exists trg_audit_%1$s on cwems.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on cwems.%1$s for each row execute function cwems.audit_trigger()', t);
  end loop;
end $$;

-- Beneficiary records are never hard-deleted.
create or replace function cwems.block_hard_delete() returns trigger language plpgsql as $$
begin raise exception 'Records cannot be deleted. Archive instead (is_archived = true) with a reason.'; end $$;
drop trigger if exists trg_no_delete_ben on cwems.beneficiaries;
create trigger trg_no_delete_ben before delete on cwems.beneficiaries
  for each row execute function cwems.block_hard_delete();

-- Corrections to a beneficiary require a reason (recorded in the audit log).
create or replace function cwems.require_reason_on_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if coalesce(current_setting('cwems.reason', true), '') = '' then
    raise exception 'A reason is required to correct a beneficiary record (set cwems.reason)';
  end if;
  return new;
end $$;
drop trigger if exists trg_ben_reason on cwems.beneficiaries;
create trigger trg_ben_reason before update on cwems.beneficiaries
  for each row execute function cwems.require_reason_on_update();

-- ---------------------------------------------------------------------
-- 6. Registration RPC: atomic, duplicate-NRC refusal, generated ID
-- ---------------------------------------------------------------------
create or replace function cwems.normalise_nrc(p text) returns text
language sql immutable as $$ select regexp_replace(coalesce(p,''), '[^0-9]', '', 'g') $$;

create or replace function cwems.register_beneficiary(p jsonb) returns jsonb
language plpgsql security definer set search_path = cwems as $$
declare
  v_nrc text := cwems.normalise_nrc(p->>'nrc');
  v_id uuid; v_no text; v_existing text;
  v_year int := extract(year from coalesce((p->>'registration_date')::date, current_date));
begin
  if not cwems.has_permission('beneficiary.register') then
    raise exception 'Not permitted to register beneficiaries' using errcode = '42501';
  end if;
  if v_nrc !~ '^[0-9]{9}$' then
    raise exception 'Invalid NRC. Use the format 123456/12/1' using errcode = '22023';
  end if;

  select b.beneficiary_no into v_existing
  from cwems.beneficiary_identifiers i join cwems.beneficiaries b on b.id = i.beneficiary_id
  where i.nrc_normalised = v_nrc;
  if found then
    raise exception 'DUPLICATE_NRC: this NRC is already registered (%).', v_existing using errcode = '23505';
  end if;

  v_no := cwems.next_beneficiary_no(v_year);
  insert into cwems.beneficiaries(beneficiary_no, full_name, date_of_birth, approx_age, phone, alt_contact,
      province, district, community, number_of_children, number_of_dependants, education_background,
      employment_status, income_sources, existing_business, skills, business_interests,
      registration_date, assigned_field_officer)
  values (v_no, btrim(p->>'full_name'), nullif(p->>'date_of_birth','')::date, nullif(p->>'approx_age','')::int,
      nullif(p->>'phone',''), nullif(p->>'alt_contact',''), p->>'province', p->>'district', p->>'community',
      coalesce((p->>'number_of_children')::int,0), coalesce((p->>'number_of_dependants')::int,0),
      p->>'education_background', p->>'employment_status', p->>'income_sources', p->>'existing_business',
      p->>'skills', p->>'business_interests',
      coalesce((p->>'registration_date')::date, current_date),
      coalesce(nullif(p->>'assigned_field_officer','')::uuid, auth.uid()))
  returning id into v_id;

  begin
    insert into cwems.beneficiary_identifiers(beneficiary_id, nrc_display, nrc_normalised)
    values (v_id, substr(v_nrc,1,6)||'/'||substr(v_nrc,7,2)||'/'||substr(v_nrc,9,1), v_nrc);
  exception when unique_violation then
    -- race: two people registered the same NRC at the same instant; whole transaction rolls back
    raise exception 'DUPLICATE_NRC: this NRC is already registered.' using errcode = '23505';
  end;

  insert into cwems.beneficiary_households(beneficiary_id, household_size, main_income_source)
  values (v_id, nullif(p->>'household_size','')::int, nullif(p->>'income_sources',''));

  return jsonb_build_object('id', v_id, 'beneficiary_no', v_no);
end $$;
revoke all on function cwems.register_beneficiary(jsonb) from public, anon;
grant execute on function cwems.register_beneficiary(jsonb) to authenticated;

-- Lets the form warn early without exposing who owns the NRC.
create or replace function cwems.nrc_exists(p_nrc text) returns boolean
language sql stable security definer set search_path = cwems as $$
  select cwems.has_permission('beneficiary.register') and exists
    (select 1 from cwems.beneficiary_identifiers where nrc_normalised = cwems.normalise_nrc(p_nrc))
$$;
revoke all on function cwems.nrc_exists(text) from public, anon;
grant execute on function cwems.nrc_exists(text) to authenticated;

-- Correction RPC: old/new captured by audit trigger, reason mandatory.
create or replace function cwems.correct_beneficiary(p_id uuid, p_changes jsonb, p_reason text) returns void
language plpgsql security definer set search_path = cwems as $$
declare allowed text[] := array['full_name','date_of_birth','approx_age','phone','alt_contact','province','district',
  'community','number_of_children','number_of_dependants','education_background','employment_status',
  'income_sources','existing_business','skills','business_interests','assigned_field_officer','is_archived'];
  k text;
begin
  if not cwems.has_permission('beneficiary.update') then raise exception 'Not permitted' using errcode='42501'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any(allowed)) then raise exception 'Field % cannot be corrected here', k; end if;
  end loop;
  perform set_config('cwems.reason', p_reason, true);
  update cwems.beneficiaries b set
    full_name = coalesce(p_changes->>'full_name', b.full_name),
    phone = case when p_changes ? 'phone' then p_changes->>'phone' else b.phone end,
    alt_contact = case when p_changes ? 'alt_contact' then p_changes->>'alt_contact' else b.alt_contact end,
    province = coalesce(p_changes->>'province', b.province),
    district = coalesce(p_changes->>'district', b.district),
    community = coalesce(p_changes->>'community', b.community),
    number_of_children = coalesce((p_changes->>'number_of_children')::int, b.number_of_children),
    number_of_dependants = coalesce((p_changes->>'number_of_dependants')::int, b.number_of_dependants),
    is_archived = coalesce((p_changes->>'is_archived')::boolean, b.is_archived)
  where b.id = p_id;
end $$;
revoke all on function cwems.correct_beneficiary(uuid,jsonb,text) from public, anon;
grant execute on function cwems.correct_beneficiary(uuid,jsonb,text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------
alter table cwems.roles enable row level security;
alter table cwems.permissions enable row level security;
alter table cwems.role_permissions enable row level security;
alter table cwems.profiles enable row level security;
alter table cwems.system_settings enable row level security;
alter table cwems.programme_cohorts enable row level security;
alter table cwems.beneficiaries enable row level security;
alter table cwems.beneficiary_identifiers enable row level security;
alter table cwems.beneficiary_households enable row level security;
alter table cwems.consent_records enable row level security;
alter table cwems.enrolments enable row level security;
alter table cwems.audit_logs enable row level security;
alter table cwems.beneficiary_counters enable row level security;

drop policy if exists p_ref_read on cwems.roles;            create policy p_ref_read on cwems.roles for select to authenticated using (true);
drop policy if exists p_perm_read on cwems.permissions;     create policy p_perm_read on cwems.permissions for select to authenticated using (true);
drop policy if exists p_rp_read on cwems.role_permissions;  create policy p_rp_read on cwems.role_permissions for select to authenticated using (true);

-- profiles: everyone signed in sees names (needed for assignment); only admin changes roles (trigger above)
drop policy if exists p_prof_read on cwems.profiles;   create policy p_prof_read on cwems.profiles for select to authenticated using (true);
drop policy if exists p_prof_upd on cwems.profiles;    create policy p_prof_upd on cwems.profiles for update to authenticated
  using (id = auth.uid() or cwems.has_permission('users.manage')) with check (id = auth.uid() or cwems.has_permission('users.manage'));

drop policy if exists p_set_read on cwems.system_settings;  create policy p_set_read on cwems.system_settings for select to authenticated using (true);
drop policy if exists p_set_write on cwems.system_settings; create policy p_set_write on cwems.system_settings for all to authenticated
  using (cwems.has_permission('settings.manage')) with check (cwems.has_permission('settings.manage'));

drop policy if exists p_coh_read on cwems.programme_cohorts;  create policy p_coh_read on cwems.programme_cohorts for select to authenticated using (true);
drop policy if exists p_coh_write on cwems.programme_cohorts; create policy p_coh_write on cwems.programme_cohorts for all to authenticated
  using (cwems.has_permission('settings.manage') or cwems.has_permission('enrolment.request'))
  with check (cwems.has_permission('settings.manage') or cwems.has_permission('enrolment.request'));

-- beneficiaries: all-view roles see everything; field officers only their own assignments
drop policy if exists p_ben_read on cwems.beneficiaries;
create policy p_ben_read on cwems.beneficiaries for select to authenticated using (
  cwems.has_permission('beneficiary.view_all')
  or (cwems.has_permission('beneficiary.view_assigned') and (assigned_field_officer = auth.uid() or created_by = auth.uid())));
-- No direct INSERT/UPDATE/DELETE policies: writes go through register_beneficiary / correct_beneficiary.

drop policy if exists p_hh_read on cwems.beneficiary_households;
create policy p_hh_read on cwems.beneficiary_households for select to authenticated using (
  exists (select 1 from cwems.beneficiaries b where b.id = beneficiary_id));   -- inherits beneficiary RLS

-- NRC: only roles with beneficiary.view_nrc (field officers cannot read back NRCs)
drop policy if exists p_nrc_read on cwems.beneficiary_identifiers;
create policy p_nrc_read on cwems.beneficiary_identifiers for select to authenticated using (cwems.has_permission('beneficiary.view_nrc'));

drop policy if exists p_consent_read on cwems.consent_records;
create policy p_consent_read on cwems.consent_records for select to authenticated using (
  exists (select 1 from cwems.beneficiaries b where b.id = beneficiary_id));
drop policy if exists p_consent_ins on cwems.consent_records;
create policy p_consent_ins on cwems.consent_records for insert to authenticated with check (
  exists (select 1 from cwems.beneficiaries b where b.id = beneficiary_id));

drop policy if exists p_enrol_read on cwems.enrolments;
create policy p_enrol_read on cwems.enrolments for select to authenticated using (
  cwems.has_permission('beneficiary.view_all'));
drop policy if exists p_enrol_ins on cwems.enrolments;
create policy p_enrol_ins on cwems.enrolments for insert to authenticated with check (
  cwems.has_permission('enrolment.request') and status = 'requested' and requested_by = auth.uid());
drop policy if exists p_enrol_appr on cwems.enrolments;
create policy p_enrol_appr on cwems.enrolments for update to authenticated
  using (cwems.has_permission('enrolment.approve')) with check (cwems.has_permission('enrolment.approve'));

drop policy if exists p_audit_read on cwems.audit_logs;
create policy p_audit_read on cwems.audit_logs for select to authenticated using (cwems.has_permission('audit.view'));
-- beneficiary_counters: no policies => no access for API roles (function is security definer)

-- ---------------------------------------------------------------------
-- 8. Dashboard view (counts straight from the database; security_invoker respects RLS)
-- ---------------------------------------------------------------------
create or replace view cwems.v_dashboard_counts with (security_invoker = true) as
select
  count(*) filter (where status = 'mobilised')                                   as mobilised,
  count(*) filter (where status <> 'mobilised' and not is_archived)              as registered,
  count(*) filter (where status in ('enrolled','active','graduated','post_graduation')) as enrolled,
  count(*) filter (where status = 'active')                                      as active,
  count(*) filter (where status = 'graduated')                                   as graduates,
  count(*) filter (where status = 'post_graduation')                             as post_graduation
from cwems.beneficiaries;

grant select on cwems.v_dashboard_counts to authenticated;

-- ---------------------------------------------------------------------
-- 9. API privileges (custom schemas need explicit grants; RLS above still decides row access)
-- ---------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema cwems to authenticated;
grant usage on all sequences in schema cwems to authenticated;
grant execute on function cwems.has_permission(text), cwems.current_role_name(), cwems.normalise_nrc(text) to authenticated;
-- IMPORTANT: also expose the schema to the API: Supabase > Settings > API > "Exposed schemas" > add  cwems
