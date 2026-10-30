-- Pause-time capping + technician segments. Run after stub + migrations + seed.
\set ON_ERROR_STOP on
-- Brisbane, knock-off 17:30. Sam on the CX-5 strip yesterday:
--   09:00-10:00 work, paused (parts) -> resumed 11:00   = 1h pause
--   11:00-16:00 work, paused (parts) -> resumed next day = capped at 17:30 -> 1.5h pause
--   tomorrow   resumed at 08:00 (we use 'yesterday + 1' = today 08:00 if that's in the past, so build relative to yesterday)
do $$
declare d date := (now() at time zone 'Australia/Brisbane')::date - 2; tz text := 'Australia/Brisbane';
begin
  insert into work_segments (quote_line_id, technician_id, started_at, ended_at, end_type, delay_reason_id) values
   ('00000000-0000-0000-0000-0000000001e1','00000000-0000-0000-0000-0000000000b1', (d + time '09:00') at time zone tz, (d + time '10:00') at time zone tz, 'paused', '00000000-0000-0000-0000-0000000000a1'),
   ('00000000-0000-0000-0000-0000000001e1','00000000-0000-0000-0000-0000000000b1', (d + time '11:00') at time zone tz, (d + time '16:00') at time zone tz, 'paused', '00000000-0000-0000-0000-0000000000a1'),
   ('00000000-0000-0000-0000-0000000001e1','00000000-0000-0000-0000-0000000000b1', (d + 1 + time '08:00') at time zone tz, (d + 1 + time '09:00') at time zone tz, 'paused', '00000000-0000-0000-0000-0000000000a5'),
   -- paused after knock-off: counts zero
   ('00000000-0000-0000-0000-0000000001f1','00000000-0000-0000-0000-0000000000b3', (d + time '17:00') at time zone tz, (d + time '18:00') at time zone tz, 'paused', '00000000-0000-0000-0000-0000000000a2');
end $$;
do $$ begin
  assert (select round(sum(pause_hours)::numeric, 2) from v_technician_segments where technician_name like 'Sam%') >= 2.5 + 8.5,
         'sam pause: ' || (select round(sum(pause_hours)::numeric, 2) from v_technician_segments where technician_name like 'Sam%');
  -- first two pauses exactly 1h and 1.5h
  assert (select array_agg(round(pause_hours::numeric, 2) order by started_at) from v_technician_segments where technician_name like 'Sam%') [1:2] = array[1.00, 1.50]::numeric[],
         'sam pauses: ' || (select array_agg(round(pause_hours::numeric, 2) order by started_at)::text from v_technician_segments where technician_name like 'Sam%');
  assert (select pause_hours from v_technician_segments where technician_name like 'Tom%') = 0, 'after knock-off pause should be 0';
  assert (select round(sum(hours)::numeric, 2) from v_technician_segments where technician_name like 'Sam%') = 7.00, 'sam hours';
  assert (select count(distinct job_id) from v_technician_segments where technician_name like 'Sam%') = 1, 'sam jobs';
end $$;
\echo ALL TECHNICIAN REPORT TESTS PASSED
