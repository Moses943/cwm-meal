-- STEP 2. Run this AFTER creating your first user in Supabase (Authentication -> Users -> Add user).
-- Change the email and name below, then run the whole file.

select cwems.add_staff('CHANGE-ME@example.com', 'Your Full Name', 'system_admin');

-- First programme cohort (6 months, 20 widows, K500 a month). Change the start date if needed.
insert into cwems.programme_cohorts(name, start_date, duration_months, target_beneficiaries, monthly_support_zmw)
values ('Cohort 1', '2026-12-01', 6, 20, 500)
on conflict (name) do nothing;

-- Add other staff later the same way (create their user in Authentication first). Roles:
-- founder, co_founder, project_director, project_coordinator, secretary, accounts_officer, me_officer, system_admin (Administrator)
-- select cwems.add_staff('someone@example.com', 'Their Name', 'project_director');
-- select cwems.add_staff('another@example.com', 'Their Name', 'secretary');
