# Bodyshop Job Timer

Wall-tablet job timer for a panel-beating shop: quoted vs actual hours per iBodyshop quote line.
Next.js (App Router) + TypeScript + Tailwind, Supabase Postgres + Auth.

## Status
- [x] Session 1: database schema, views, RLS, seed (`supabase/`)
- [x] Session 2: admin screen (jobs, quote lines, auto-assign, technicians & PINs, delay reasons, settings)
- [x] Session 3: wall board + clock on/off with PIN pad (`/board`)
- [x] Session 4: server-side clock rules, auto clock-off (every 5 min via pg_cron), flagged-segment review (`/admin/review`)
- [ ] Session 5: owner dashboard, PWA, kiosk set-up

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

## Pair the workshop tablet
On the tablet, sign in as an admin, open **Settings**, tap **Use this device as the wall board**. The tablet keeps
showing `/board` from then on (you can sign out). Revoke a lost tablet from the same page.

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
supabase/seed.sql                          dev seed (PINs 1111 / 2222 / 3333)
supabase/tests/smoke.sql                   constraint + view checks (scratch Postgres)
supabase/tests/kiosk.sql                   clock-rule checks (scratch Postgres)
supabase/tests/review.sql                  auto clock-off + review checks (scratch Postgres)
```
