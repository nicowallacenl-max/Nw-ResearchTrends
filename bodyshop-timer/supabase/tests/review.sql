-- Auto clock-off + review. Run after stub + migrations + seed (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@x'),('22222222-2222-2222-2222-222222222222','owner@x') on conflict do nothing;
insert into app_users values ('11111111-1111-1111-1111-111111111111','admin@x','admin'),('22222222-2222-2222-2222-222222222222','owner@x','owner') on conflict do nothing;

-- Brisbane, knock-off 17:30. Three running timers:
--   Sam: started yesterday 09:00  -> closed at yesterday 17:30
--   Tom: started yesterday 19:00 (overtime) -> closed at yesterday 23:59:59
--   Jess: started 1 minute ago    -> left running (its knock-off is still ahead, or it's overtime today)
insert into work_segments (id, quote_line_id, technician_id, started_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b1',
   ((now() at time zone 'Australia/Brisbane')::date - 1 + time '09:00') at time zone 'Australia/Brisbane'),
 ('aaaaaaaa-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000001f1','00000000-0000-0000-0000-0000000000b3',
   ((now() at time zone 'Australia/Brisbane')::date - 1 + time '19:00') at time zone 'Australia/Brisbane'),
 ('aaaaaaaa-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-0000000000b2', now() - interval '1 minute');

do $$ declare n int; begin
  n := auto_clock_off();
  assert n = 2, 'expected 2 closed, got ' || n;
  assert (select ended_at at time zone 'Australia/Brisbane' from work_segments where id='aaaaaaaa-0000-0000-0000-000000000001')
         = (now() at time zone 'Australia/Brisbane')::date - 1 + time '17:30', 'Sam cut-off';
  assert (select ended_at at time zone 'Australia/Brisbane' from work_segments where id='aaaaaaaa-0000-0000-0000-000000000002')
         = (now() at time zone 'Australia/Brisbane')::date - 1 + time '23:59:59', 'Tom overtime cut-off';
  assert (select end_type = 'auto_closed' and needs_review from work_segments where id='aaaaaaaa-0000-0000-0000-000000000001');
  assert (select ended_at is null from work_segments where id='aaaaaaaa-0000-0000-0000-000000000003'), 'Jess should still run';
  assert (select count(*) from v_review_queue) = 2, 'review queue';
  assert auto_clock_off() = 0, 'second run closes nothing';
end $$;
\echo ok - auto clock-off

-- review as owner: refused
set role authenticated;
set request.jwt.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  begin perform review_segment('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'owner reviewed';
  exception when raise_exception then if sqlerrm <> 'admin only' then raise; end if; end;
end $$;

-- review as admin
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare d date := (now() at time zone 'Australia/Brisbane')::date - 1; begin
  -- approve unchanged
  perform review_segment('aaaaaaaa-0000-0000-0000-000000000002');
  -- correct Sam: actually stopped at 16:00
  perform review_segment('aaaaaaaa-0000-0000-0000-000000000001', null, d + time '16:00');
  -- bad corrections are refused
  begin perform review_segment('aaaaaaaa-0000-0000-0000-000000000001', d + time '17:00', d + time '16:00'); raise exception 'end<start accepted';
  exception when raise_exception then if sqlerrm not like 'The end time must%' then raise; end if; end;
  begin perform review_segment('aaaaaaaa-0000-0000-0000-000000000003'); raise exception 'running reviewed';
  exception when raise_exception then if sqlerrm <> 'This timer is still running' then raise; end if; end;
end $$;
reset role;
do $$ declare d date := (now() at time zone 'Australia/Brisbane')::date - 1; begin
  assert (select count(*) from v_review_queue) = 0, 'queue not cleared';
  assert (select ended_at at time zone 'Australia/Brisbane' = d + time '16:00'
             and original_ended_at at time zone 'Australia/Brisbane' = d + time '17:30'
             and edited_by is not null and reviewed_by is not null
          from work_segments where id='aaaaaaaa-0000-0000-0000-000000000001'), 'Sam correction/audit';
  assert (select edited_by is null and original_ended_at is null and reviewed_at is not null
          from work_segments where id='aaaaaaaa-0000-0000-0000-000000000002'), 'unchanged approve should not mark edited';
end $$;
\echo ALL REVIEW TESTS PASSED
