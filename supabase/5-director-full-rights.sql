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
