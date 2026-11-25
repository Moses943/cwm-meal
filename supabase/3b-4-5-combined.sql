-- ROLES UPGRADE, STEP 2 (combined). Run AFTER 3a-roles-step1.sql has been run on its own.
-- This one file does: 3b (7 positions) + 4 (Founder sees all, Director manages staff) + 5 (Director full rights).

-- ROLES UPGRADE, STEP 2 of 2. Run after 3a.
-- Converts the role list to the 7 management positions + Administrator, keeping existing users.
--   director -> project_director          programme_coordinator -> project_coordinator
--   finance_officer -> accounts_officer   field_officer -> secretary   training_officer -> co_founder
--   me_officer and system_admin (shown as "Administrator") keep their names.

do $$
declare r record;
begin
  for r in select * from (values
      ('director','project_director'), ('programme_coordinator','project_coordinator'),
      ('finance_officer','accounts_officer'), ('field_officer','secretary'), ('training_officer','co_founder')
    ) as m(old_name,new_name)
  loop
    if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
               where t.typname = 'app_role' and t.typnamespace = 'cwems'::regnamespace and e.enumlabel = r.old_name) then
      execute format('alter type cwems.app_role rename value %L to %L', r.old_name, r.new_name);
    end if;
  end loop;
end $$;

-- A new staff member must always be given a role explicitly.
alter table cwems.profiles alter column role drop default;

delete from cwems.role_permissions;
delete from cwems.roles where role::text not in ('founder','co_founder','project_director','project_coordinator','secretary','accounts_officer','me_officer','system_admin');

insert into cwems.roles(role,label,description) values
 ('founder','Founder','Overall institutional leadership; oversight dashboard (view only)'),
 ('co_founder','Co-Founder','Governance and strategic guidance; programme performance oversight (view only)'),
 ('project_director','Project Director','Project oversight and supervision; approves enrolment, finance, reports, graduation'),
 ('project_coordinator','Project Coordinator','Daily implementation: registers and updates beneficiaries, requests enrolment, manages training'),
 ('secretary','Secretary','Administration, documentation and beneficiary records'),
 ('accounts_officer','Accounts Officer','Financial management: records distributions and expenditure; cannot approve'),
 ('me_officer','M&E Officer','Data management, indicators, verification, assessments and reporting'),
 ('system_admin','Administrator','System configuration and user management; no programme approvals')
on conflict (role) do update set label = excluded.label, description = excluded.description;

insert into cwems.role_permissions(role,permission) values
 ('founder','beneficiary.view_all'),('founder','audit.view'),
 ('co_founder','beneficiary.view_all'),('co_founder','audit.view'),
 ('project_director','beneficiary.view_all'),('project_director','beneficiary.view_nrc'),('project_director','enrolment.approve'),
 ('project_director','finance.approve'),('project_director','report.approve'),('project_director','graduation.approve'),('project_director','audit.view'),
 ('project_coordinator','beneficiary.register'),('project_coordinator','beneficiary.view_all'),('project_coordinator','beneficiary.view_nrc'),
 ('project_coordinator','beneficiary.update'),('project_coordinator','enrolment.request'),('project_coordinator','training.manage'),
 ('secretary','beneficiary.register'),('secretary','beneficiary.view_all'),('secretary','beneficiary.view_nrc'),('secretary','beneficiary.update'),
 ('accounts_officer','beneficiary.view_all'),('accounts_officer','finance.record'),
 ('me_officer','beneficiary.view_all'),('me_officer','me.manage'),('me_officer','audit.view'),
 ('system_admin','users.manage'),('system_admin','settings.manage'),('system_admin','audit.view');

-- Note: the old values 'field_officer'/'training_officer'/etc. no longer exist after the renames,
-- and 'programme_cohorts' can be created by the Project Coordinator (enrolment.request) or the Administrator.

-- STEP 4. Run after 3a and 3b.
-- 1) Founder and Co-Founder can see everything (including NRCs and the audit log). Read only.
-- 2) Project Director can add staff and assign roles (but cannot create or change an Administrator).

insert into cwems.role_permissions(role,permission) values
  ('founder','beneficiary.view_nrc'), ('co_founder','beneficiary.view_nrc'),
  ('project_director','users.manage')
on conflict do nothing;

update cwems.roles set description = 'Overall leadership; can view everything (read only)' where role = 'founder';
update cwems.roles set description = 'Governance; can view everything (read only)' where role = 'co_founder';
update cwems.roles set description = 'Project oversight; approves enrolment, finance, reports, graduation; adds staff and assigns roles' where role = 'project_director';

-- Stronger guard: who may change roles / activation, and the Administrator is protected.
create or replace function cwems.guard_profile_update() returns trigger
language plpgsql security definer set search_path = cwems as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active) and auth.uid() is not null then
    if not cwems.has_permission('users.manage') then
      raise exception 'You are not allowed to change roles or activation';
    end if;
    if (new.role = 'system_admin' or old.role = 'system_admin') and cwems.current_role_name() is distinct from 'system_admin' then
      raise exception 'Only an Administrator can grant or change the Administrator role';
    end if;
    if new.id = auth.uid() and new.role is distinct from old.role and cwems.current_role_name() is distinct from 'system_admin' then
      raise exception 'You cannot change your own role';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Give a role to a person who already has a sign-in account (they used "Request access").
create or replace function cwems.grant_role(p_email text, p_full_name text, p_role cwems.app_role) returns uuid
language plpgsql security definer set search_path = cwems as $$
declare v_id uuid; v_existing cwems.app_role;
begin
  if not cwems.has_permission('users.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  if p_role = 'system_admin' and cwems.current_role_name() is distinct from 'system_admin' then
    raise exception 'Only an Administrator can grant the Administrator role';
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then raise exception 'No account with that email. Ask them to use "Request access" first.'; end if;
  select role into v_existing from cwems.profiles where id = v_id;
  if v_existing = 'system_admin' and cwems.current_role_name() is distinct from 'system_admin' then
    raise exception 'Only an Administrator can change an Administrator';
  end if;
  insert into cwems.profiles(id, full_name, email, role) values (v_id, btrim(p_full_name), lower(btrim(p_email)), p_role)
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, is_active = true;
  return v_id;
end $$;
revoke all on function cwems.grant_role(text,text,cwems.app_role) from public, anon;
grant execute on function cwems.grant_role(text,text,cwems.app_role) to authenticated;

-- People who signed up through this system's "Request access" page and have no role yet.
-- (Other users of the same Supabase project, e.g. website accounts, are NOT listed.)
create or replace function cwems.pending_signups() returns table(id uuid, email text, full_name text, created_at timestamptz)
language plpgsql security definer set search_path = cwems as $$
begin
  if not cwems.has_permission('users.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text, coalesce(u.raw_user_meta_data->>'full_name', '')::text, u.created_at
    from auth.users u
    where u.raw_user_meta_data->>'app' = 'cwems'
      and not exists (select 1 from cwems.profiles p where p.id = u.id)
    order by u.created_at desc;
end $$;
revoke all on function cwems.pending_signups() from public, anon;
grant execute on function cwems.pending_signups() to authenticated;

-- STEP 5. Run after step 4.
-- The Project Director gets every permission in the system, including managing Administrator accounts.
-- Kept on purpose: (a) nobody can approve a request they made themselves (database rule on enrolments, and
-- on payments when that module is built); (b) nobody can change their own role.

insert into cwems.permissions(code, description) values
  ('admin.manage', 'Create, change or deactivate Administrator accounts')
on conflict do nothing;

-- Every existing permission goes to the Project Director.
insert into cwems.role_permissions(role, permission)
select 'project_director', code from cwems.permissions
on conflict do nothing;

insert into cwems.role_permissions(role, permission) values ('system_admin', 'admin.manage') on conflict do nothing;

update cwems.roles set description = 'Full rights over the whole system: all approvals, staff and roles, settings, audit. Cannot approve own requests.'
where role = 'project_director';

create or replace function cwems.guard_profile_update() returns trigger
language plpgsql security definer set search_path = cwems as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active) and auth.uid() is not null then
    if not cwems.has_permission('users.manage') then
      raise exception 'You are not allowed to change roles or activation';
    end if;
    if (new.role = 'system_admin' or old.role = 'system_admin') and not cwems.has_permission('admin.manage') then
      raise exception 'Only the Project Director or an Administrator can grant or change the Administrator role';
    end if;
    if new.id = auth.uid() and new.role is distinct from old.role then
      raise exception 'You cannot change your own role';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function cwems.grant_role(p_email text, p_full_name text, p_role cwems.app_role) returns uuid
language plpgsql security definer set search_path = cwems as $$
declare v_id uuid; v_existing cwems.app_role;
begin
  if not cwems.has_permission('users.manage') then raise exception 'Not permitted' using errcode = '42501'; end if;
  if p_role = 'system_admin' and not cwems.has_permission('admin.manage') then
    raise exception 'Only the Project Director or an Administrator can grant the Administrator role';
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then raise exception 'No account with that email. Ask them to use "Request access" first.'; end if;
  if v_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  select role into v_existing from cwems.profiles where id = v_id;
  if v_existing = 'system_admin' and not cwems.has_permission('admin.manage') then
    raise exception 'Only the Project Director or an Administrator can change an Administrator';
  end if;
  insert into cwems.profiles(id, full_name, email, role) values (v_id, btrim(p_full_name), lower(btrim(p_email)), p_role)
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, is_active = true;
  return v_id;
end $$;
