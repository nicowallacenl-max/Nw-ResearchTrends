-- DEV SEED. Do not run in production: PINs are 1111 / 2222 / 3333.
-- Fixed UUIDs so reruns and tests are predictable.

insert into public.delay_reasons (id, label, system) values
  ('00000000-0000-0000-0000-0000000000a1', 'Waiting on parts',       false),
  ('00000000-0000-0000-0000-0000000000a2', 'Wrong part supplied',    false),
  ('00000000-0000-0000-0000-0000000000a3', 'Paint colour mismatch',  false),
  ('00000000-0000-0000-0000-0000000000a4', 'Insurer approval',       false),
  ('00000000-0000-0000-0000-0000000000a5', 'Rework',                 false),
  ('00000000-0000-0000-0000-0000000000a6', 'Sublet',                 false),
  ('00000000-0000-0000-0000-0000000000a7', 'Switched job',           true)   -- used by the app when a new clock-on auto-pauses
on conflict do nothing;

insert into public.technicians (id, name, pin_hash, hourly_cost_rate, procedures) values
  ('00000000-0000-0000-0000-0000000000b1', 'Sam (panel beater)', crypt('1111', gen_salt('bf')), 38.00, '{strip,repair,refit}'),
  ('00000000-0000-0000-0000-0000000000b2', 'Jess (painter)',     crypt('2222', gen_salt('bf')), 42.00, '{prep,paint}'),
  ('00000000-0000-0000-0000-0000000000b3', 'Tom (all-rounder)',  crypt('3333', gen_salt('bf')), 35.00, '{strip,repair,prep,refit}')
on conflict do nothing;

insert into public.jobs (id, ibodyshop_ref, rego, make, model, colour, status) values
  ('00000000-0000-0000-0000-0000000000c1', 'IB-10001', '123ABC', 'Toyota', 'Camry',   'Silver', 'in_progress'),
  ('00000000-0000-0000-0000-0000000000c2', 'IB-10002', '456DEF', 'Mazda',  'CX-5',    'Red',    'open'),
  ('00000000-0000-0000-0000-0000000000c3', 'IB-10003', '789GHI', 'Ford',   'Ranger',  'White',  'open'),
  ('00000000-0000-0000-0000-0000000000c4', 'IB-10004', '321JKL', 'Hyundai','i30',     'Blue',   'open')
on conflict do nothing;

insert into public.quote_lines (id, job_id, description, procedure, quoted_hours, assigned_technician_id, completed_at) values
  -- Job 1: Camry, strip done, repair in progress
  ('00000000-0000-0000-0000-0000000001d1','00000000-0000-0000-0000-0000000000c1','Front bumper - remove',      'strip',  1.5, '00000000-0000-0000-0000-0000000000b1', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000c1','Left guard - repair',       'repair', 4.0, '00000000-0000-0000-0000-0000000000b1', null),
  ('00000000-0000-0000-0000-0000000001d3','00000000-0000-0000-0000-0000000000c1','Front bumper - prep',       'prep',   3.0, '00000000-0000-0000-0000-0000000000b2', null),
  ('00000000-0000-0000-0000-0000000001d4','00000000-0000-0000-0000-0000000000c1','Front bumper & guard - paint','paint',  5.0, '00000000-0000-0000-0000-0000000000b2', null),
  ('00000000-0000-0000-0000-0000000001d5','00000000-0000-0000-0000-0000000000c1','Reassemble & check',        'refit',  2.0, '00000000-0000-0000-0000-0000000000b1', null),
  -- Job 2: CX-5, nothing started
  ('00000000-0000-0000-0000-0000000001e1','00000000-0000-0000-0000-0000000000c2','Rear door - strip',         'strip',  1.0, '00000000-0000-0000-0000-0000000000b3', null),
  ('00000000-0000-0000-0000-0000000001e2','00000000-0000-0000-0000-0000000000c2','Rear door - repair',        'repair', 3.5, '00000000-0000-0000-0000-0000000000b1', null),
  ('00000000-0000-0000-0000-0000000001e3','00000000-0000-0000-0000-0000000000c2','Rear door - prep',          'prep',   2.0, '00000000-0000-0000-0000-0000000000b2', null),
  ('00000000-0000-0000-0000-0000000001e4','00000000-0000-0000-0000-0000000000c2','Rear door - paint',         'paint',  3.0, '00000000-0000-0000-0000-0000000000b2', null),
  -- Job 3: Ranger, no strip needed (repair is immediately ready)
  ('00000000-0000-0000-0000-0000000001f1','00000000-0000-0000-0000-0000000000c3','Tailgate - repair',         'repair', 2.5, '00000000-0000-0000-0000-0000000000b3', null),
  ('00000000-0000-0000-0000-0000000001f2','00000000-0000-0000-0000-0000000000c3','Tailgate - paint',          'paint',  2.5, '00000000-0000-0000-0000-0000000000b2', null),
  -- Job 4: i30, paint only
  ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-0000000000c4','Roof - paint',              'paint',  4.0, '00000000-0000-0000-0000-0000000000b2', null),
  ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-0000000000c4','Reassemble & check',        'refit',  1.0, '00000000-0000-0000-0000-0000000000b3', null)
on conflict do nothing;

-- History so the views have something to show.
insert into public.work_segments (quote_line_id, technician_id, started_at, ended_at, end_type, delay_reason_id, role, helper_reason) values
  -- Strip done in 2.0h (quoted 1.5)
  ('00000000-0000-0000-0000-0000000001d1','00000000-0000-0000-0000-0000000000b1', now() - interval '2 days 5 hours', now() - interval '2 days 3 hours', 'completed', null, 'owner', null),
  -- Repair: 2h, paused for parts (resumed next morning), then 1.5h with a helper, then ongoing is NOT seeded (no running rows in seed)
  ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b1', now() - interval '1 day 8 hours', now() - interval '1 day 6 hours', 'paused', '00000000-0000-0000-0000-0000000000a1', 'owner', null),
  ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b1', now() - interval '1 day 1 hour',  now() - interval '1 day', 'paused', '00000000-0000-0000-0000-0000000000a5', 'owner', null),
  ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b3', now() - interval '20 hours',     now() - interval '18 hours 30 minutes', 'paused', '00000000-0000-0000-0000-0000000000a7', 'helper', 'owner absent')
on conflict do nothing;
