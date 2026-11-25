# CWEMS setup guide

1. **Supabase** – SQL Editor, run in order: `supabase/1-run-first-schema.sql`, then `supabase/3a-roles-step1.sql` (alone), then `supabase/3b-4-5-combined.sql`.
2. **Data API** – Settings > Data API: expose the `cwems` schema, its tables and functions (register_beneficiary, nrc_exists, correct_beneficiary, grant_role, pending_signups). Then run `notify pgrst, 'reload schema';`.
3. **First user** – sign up at /signup, then in SQL run `select cwems.add_staff('your@email','Your Name','project_director');`.
4. **Netlify** – connect this GitHub repo (or drop the folder). `netlify.toml` already sets the build and Supabase public values.
5. **Supabase Auth** – URL Configuration: Site URL = your Netlify address.
6. **Staff** – each person uses Request access; the Project Director assigns roles on the Staff screen.
7. Never put the Supabase *secret* key in the code or in GitHub.

## Branding
Carried over from the CWM MEAL app (Moses943/cwm-meal): green theme (#2e7d32), leaf logo (`public/logo.jpg`), looping nature video wallpaper (`public/wallpaper.mp4`, shown behind every page), and the install-as-app icons/manifest (`public/manifest.json`).
