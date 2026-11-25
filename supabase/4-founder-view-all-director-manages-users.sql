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
