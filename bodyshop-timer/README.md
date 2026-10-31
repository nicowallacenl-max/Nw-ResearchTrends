# Bodyshop Job Timer

Wall-tablet job timer for a panel-beating shop: quoted vs actual hours per iBodyshop quote line.
Next.js (App Router) + TypeScript + Tailwind, Supabase Postgres + Auth.

## Status
- [x] Session 1: database schema, views, RLS, seed (`supabase/`)
- [x] Session 2: admin screen (jobs, quote lines, auto-assign, technicians & PINs, delay reasons, settings)
- [x] Session 3: wall board + clock on/off with PIN pad (`/board`)
- [x] Session 4: server-side clock rules, auto clock-off (every 5 min via pg_cron), flagged-segment review (`/admin/review`)
- [x] Session 5: owner dashboard (`/dashboard`), installable wall-board app, kiosk set-up guide (Admin → Settings)

## Run it
```
# Supabase URL + publishable key default to the shop project (src/lib/supabase/config.ts);
# copy .env.example to .env.local only to point at a different project.
npm install
npm run dev                  # http://localhost:3000
```

## Give someone admin access
1. Supabase dashboard → Authentication → Users → **Add user** (email + password, tick *Auto confirm*).
2. SQL Editor:
   ```sql
   insert into app_users (id, email, role)
   select id, email, 'admin' from auth.users where email = 'you@example.com';
   ```
   Use `'owner'` instead of `'admin'` for read-only owner access (dashboard comes in Session 5).

## Workshop OS screens (docs/mockups)
- `/admin`: Workshop floor dashboard (KPIs, repair bays, job pipeline). Header search covers rego, job # and customer.
- `/admin/jobs/[id]`: job detail: 7-stage progress (Assess → Approve → Strip → Panel → Paint → Reassemble → QC & Ready),
  damage scan (body-type templates in `src/lib/vehicle.ts`), photos (Supabase Storage bucket `job-photos`), estimate, activity log,
  then **Manage job** (quote lines, details, damage, photos, tracker link, status).
- `/track/[token]`: public customer tracker (unguessable link per job; no prices, names or claim details).
- Stage moves forward automatically as work starts/finishes; the office uses ADVANCE STAGE / MARK COMPLETE / Back a stage.

## Set up the workshop tablet
1. Install the board as an app: Android Chrome → ⋮ → **Install app**; iPad Safari → Share → **Add to Home Screen**.
2. Open the installed **Job Board** app, tap **Admin sign-in**, sign in, open **Settings**, tap **Use this device as the wall board**.
   (Pair from inside the installed app: on iPad it has its own storage, separate from Safari.)
3. Lock it to the app: Android **App pinning**, iPad **Guided Access**. Keep it on charge; the board keeps the screen awake.

Revoke a lost tablet from Settings. Owners (role `owner`) sign in to the read-only **dashboard** at `/dashboard`.

## Database
```
supabase/migrations/…01_schema.sql         tables, enums, constraints, audit triggers
supabase/migrations/…02_views.sql          derived-hours / dashboard views
supabase/migrations/…03_rls_and_pin.sql    RLS, grants, PIN functions
supabase/migrations/…04_advisor_fixes.sql  Supabase security-advisor fixes
supabase/migrations/…05_kiosk.sql          wall board: device pairing + clock-rule functions
supabase/migrations/…06_…                  advisor fix
supabase/migrations/…07_clock_off_and_review.sql  knock-off auto clock-off + admin review/correct
supabase/migrations/…08_schedule_clock_off.sql    pg_cron schedule (every 5 minutes)
supabase/migrations/…09_job_substatus.sql         derived job substatus (working / paused + reason / stopped / idle)
supabase/migrations/…10_pause_time_and_technician_report.sql  pause time capped at knock-off; per-technician timer view
supabase/migrations/…11_workshop_os.sql        job details, stages, damage, photos, activity, tracker
supabase/migrations/…12_photo_storage.sql      photo bucket + admin-only write policies
supabase/seed.sql                          dev seed: technicians (PINs 1111 / 2222 / 3333), jobs, reasons. No timer history.
supabase/tests/smoke.sql                   constraint + view checks (scratch Postgres)
supabase/tests/kiosk.sql                   clock-rule checks (scratch Postgres)
supabase/tests/review.sql                  auto clock-off + review checks (scratch Postgres)
supabase/tests/substatus.sql               job substatus checks
supabase/tests/technician_report.sql       pause-time capping + technician report view
supabase/tests/demo_history.sql            demo timers loaded by smoke.sql only
supabase/tests/workshop_os.sql             job numbers, stage automation, activity, tracker
```
