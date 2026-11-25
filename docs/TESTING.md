# Testing status

| Area | How tested | Result |
|---|---|---|
| Migration applies cleanly, twice | PGlite (in-memory Postgres) | Pass |
| Duplicate NRC refused (3 formats, direct insert bypassing the form) | PGlite | Pass |
| Sequential CWM IDs, no gaps after refused duplicate | PGlite | Pass |
| RLS: field officer sees only own, no NRC, no audit, no direct insert/delete | PGlite | Pass |
| Finance officer cannot register or read NRC | PGlite | Pass |
| Correction needs reason; audit has old/new/user/reason; log append-only | PGlite | Pass |
| One enrolment per cohort; coordinator cannot approve; 6-month end date | PGlite | Pass |
| TypeScript + production build | `next build` | Pass |

## Not yet tested (needs your Supabase project)
- Real sign-in, password reset email, session handling in the browser.
- The registration form and NRC warning in a live browser; mobile layout on a phone.
- Supabase-specific behaviour (auth trigger on `auth.users`, PostgREST RPC calls).
Acceptance tests 1-6 from the spec can be run once the app is connected.
