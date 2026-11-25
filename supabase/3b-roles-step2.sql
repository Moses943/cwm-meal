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
