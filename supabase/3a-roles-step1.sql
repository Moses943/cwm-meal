-- ROLES UPGRADE, STEP 1 of 2. Run this file ALONE first, then run 3b.
-- (Postgres needs a new role value to be saved before it can be used.)
alter type cwems.app_role add value if not exists 'founder';
