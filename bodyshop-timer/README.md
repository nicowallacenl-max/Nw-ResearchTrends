# Bodyshop Job Timer

Build spec: see the spec document. This folder currently holds **Session 1**: Supabase schema only.

```
supabase/migrations/20261030000001_schema.sql        tables, enums, constraints, audit triggers
supabase/migrations/20261030000002_views.sql         derived-hours / dashboard views
supabase/migrations/20261030000003_rls_and_pin.sql   RLS, grants, PIN functions
supabase/seed.sql                                    dev seed (PINs 1111 / 2222 / 3333)
supabase/tests/smoke.sql                             constraint + view checks (run against a scratch Postgres)
```

Apply with the Supabase CLI: `supabase db reset` (runs migrations then `seed.sql`).
