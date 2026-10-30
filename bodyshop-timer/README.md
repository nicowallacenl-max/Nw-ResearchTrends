# Bodyshop Job Timer

Wall-tablet job timer for a panel-beating shop: quoted vs actual hours per iBodyshop quote line.
Next.js (App Router) + TypeScript + Tailwind, Supabase Postgres + Auth.

## Status
- [x] Session 1: database schema, views, RLS, seed (`supabase/`)
- [x] Session 2: admin screen (jobs, quote lines, auto-assign, technicians & PINs, delay reasons, settings)
- [ ] Session 3: wall board + clock on/off with PIN pad
- [ ] Session 4: server-side clock rules, auto clock-off, flagged-segment review
- [ ] Session 5: owner dashboard, PWA, kiosk set-up

## Run it
```
cp .env.example .env.local   # fill in Supabase URL + publishable key
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

## Database
```
supabase/migrations/…01_schema.sql         tables, enums, constraints, audit triggers
supabase/migrations/…02_views.sql          derived-hours / dashboard views
supabase/migrations/…03_rls_and_pin.sql    RLS, grants, PIN functions
supabase/migrations/…04_advisor_fixes.sql  Supabase security-advisor fixes
supabase/seed.sql                          dev seed (PINs 1111 / 2222 / 3333)
supabase/tests/smoke.sql                   constraint + view checks (scratch Postgres)
```
