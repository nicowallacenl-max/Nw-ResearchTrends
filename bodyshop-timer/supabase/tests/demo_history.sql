-- Demo timer history used by smoke.sql (NOT part of the seed: it would inflate real totals).
-- History so the views have something to show.
insert into public.work_segments (quote_line_id, technician_id, started_at, ended_at, end_type, delay_reason_id, role, helper_reason) values
  -- Strip done in 2.0h (quoted 1.5)
  ('00000000-0000-0000-0000-0000000001d1','00000000-0000-0000-0000-0000000000b1', now() - interval '2 days 5 hours', now() - interval '2 days 3 hours', 'completed', null, 'owner', null),
  -- Repair: 2h, paused for parts (resumed next morning), then 1.5h with a helper, then ongoing is NOT seeded (no running rows in seed)
  ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b1', now() - interval '1 day 8 hours', now() - interval '1 day 6 hours', 'paused', '00000000-0000-0000-0000-0000000000a1', 'owner', null),
  ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b1', now() - interval '1 day 1 hour',  now() - interval '1 day', 'paused', '00000000-0000-0000-0000-0000000000a5', 'owner', null),
  ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b3', now() - interval '20 hours',     now() - interval '18 hours 30 minutes', 'paused', '00000000-0000-0000-0000-0000000000a7', 'helper', 'owner absent')
on conflict do nothing;
