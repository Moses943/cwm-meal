# CWEMS – Cornerstone Widows Empowerment & Monitoring System

Status: **Phases 1–2 (foundation and registration)**. Other menu items are marked "soon" and open a page that says the module is not built.

## What works now
- Email/password sign-in (Supabase Auth), password-reset email, all pages behind login.
- The 7 management positions (Founder, Co-Founder, Project Director, Project Coordinator, Secretary, Accounts Officer, M&E Officer) plus an Administrator, each with its own permissions; Row Level Security on every table.
- Beneficiary registration with automatic IDs `CWM-2026-001, 002, …` (counter is atomic).
- **Duplicate NRC is refused** (any format: `123456/12/1`, `123456121`, `123456-12-1`) by a database UNIQUE constraint, checked inside one transaction. The form also warns when you leave the NRC box.
- NRCs are stored in a separate table that field officers cannot read back.
- Beneficiary list with search (name, ID, community, district), DD/MM/YYYY dates.
- Corrections need a reason; old value, new value, user and time go to an append-only audit log. Beneficiaries cannot be hard-deleted.
- Cohorts with 6-month end-date calculation; one enrolment per widow per cohort; enrolment approver must differ from requester.
- Dashboard counts and circular indicators come from the database (shows 0 / "–" when empty).

## Not built yet
Mobilisation, questionnaires/baseline, training, welfare (K500 ledger), food, business, follow-ups, M&E indicators, progress dashboards, testimonials, endline, graduation, certificates, post-graduation, reports/exports, user-management screen, settings screen, audit screen, backups. Also not yet built for registration: photo/consent upload and the enrol/approve screen (the database rules for enrolment exist and are tested).

## Setup
1. In Supabase **SQL Editor**, run `supabase/1-run-first-schema.sql`, then `3a-roles-step1.sql` (alone), then `3b-4-5-combined.sql`. Everything is created in its own `cwems` schema, so it can share a project with other apps. In Supabase Data API settings, expose the `cwems` schema, its tables, and the functions register_beneficiary, nrc_exists, correct_beneficiary, grant_role, pending_signups (not beneficiary_counters).
2. **Settings -> API -> Exposed schemas**: add `cwems` and save. (Without this the app cannot reach the data.)
3. **Authentication -> Users -> Add user** (tick auto-confirm) for yourself.
4. Edit the email and name in `supabase/2-after-first-login-user.sql` and run it. This makes you System Administrator and creates Cohort 1.
5. `cp .env.example .env.local`, fill in the project URL and **anon** key (Settings -> API). Never use the service-role key in this app.
6. `npm install && npm run dev`, open http://localhost:3000.

Only people added with `cwems.add_staff(...)` can use CWEMS. Other users of the same Supabase project (for example website sign-ups) have no access.

## Deploy (Vercel)
Import the GitHub repo, add the two `NEXT_PUBLIC_SUPABASE_*` variables, deploy. In Supabase → Authentication → URL Configuration, add your Vercel URL as Site URL and redirect URL.

## Tests
`npm run test:db` applies the migration to an in-memory Postgres twice and runs 107 checks (duplicate NRC, IDs, RLS by role, audit, enrolment rules).
These tests do **not** replace testing on your real Supabase project. See `docs/TESTING.md`.

## Roles and what they can do
| Position | Can do |
|---|---|
| Founder | View everything, including NRCs and the audit log (read only) |
| Co-Founder | View everything, including NRCs and the audit log (read only) |
| Project Director | Full rights: every permission in the system, including staff and roles (also Administrators), settings, audit log and all approvals. Cannot approve a request they made themselves or change their own role |
| Project Coordinator | Register, correct and view beneficiaries (incl. NRC); request enrolment; manage training |
| Secretary | Register, correct and view beneficiary records (incl. NRC) |
| Accounts Officer | View beneficiaries; record financial distributions (cannot approve) |
| M&E Officer | View beneficiaries; manage indicators/assessments/verification; view audit log |
| Administrator | Manage users, roles, settings; no programme or beneficiary data access |
Recording and approving money are always separate people.

## Adding staff
New staff open the sign-in page, tap **Request access**, and create an account. They see nothing until the Project Director opens **Staff and User Management** and gives them a role. The Director can also deactivate staff. The Project Director and the Administrator can create or change an Administrator.
