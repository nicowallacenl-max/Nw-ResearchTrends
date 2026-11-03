-- Job numbers, status reason lifecycle + events, activity, tracker. Run after stub + migrations + seed.
\set ON_ERROR_STOP on
do $$ begin
  assert (select count(*) from jobs where job_number like 'AB-%') = 4, 'job numbers';
  assert (select count(distinct track_token) from jobs) = 4 and (select min(length(track_token)) from jobs) = 32, 'tokens';
  assert (select count(*) from jobs where status_reason = 'approved') = 4, 'seed jobs are approved';
  assert (select count(*) from job_events where kind = 'created') = 4, 'created events';
end $$;

-- a new job starts in Review
insert into jobs (id, rego) values ('00000000-0000-0000-0000-0000000000c9', 'NEW1');
do $$ begin
  assert (select status_reason from jobs where rego = 'NEW1') = 'review', 'new job -> review';
  assert (select message from job_events where job_id = '00000000-0000-0000-0000-0000000000c9' and kind = 'created') = 'Job created · status REVIEW';
end $$;

-- Ranger: last line complete -> Completed (automatic); reopen -> Approved; picked up -> inactive; undo -> collected_at cleared
update quote_lines set completed_at = now() where job_id = '00000000-0000-0000-0000-0000000000c3';
update jobs set status = 'done' where rego = '789GHI';             -- what kiosk_complete does on the last line
do $$ begin assert (select status_reason from jobs where rego = '789GHI') = 'completed', 'all done -> completed'; end $$;
update jobs set status = 'in_progress' where rego = '789GHI';      -- what reopenLine does
do $$ begin assert (select status_reason from jobs where rego = '789GHI') = 'approved', 'reopened -> approved'; end $$;
update jobs set status = 'done' where rego = '789GHI';
update jobs set status_reason = 'picked_up' where rego = '789GHI';
do $$ begin assert (select collected_at is not null from jobs where rego = '789GHI'), 'picked up stamps collected_at'; end $$;
update jobs set status_reason = 'completed' where rego = '789GHI';
do $$ begin
  assert (select collected_at is null from jobs where rego = '789GHI'), 'undo pick-up clears collected_at';
  assert (select string_agg(message, ' | ' order by at, id) from job_events e where e.job_id = '00000000-0000-0000-0000-0000000000c3' and kind = 'status')
       = 'All job lines complete · status COMPLETED | A job line was reopened · status APPROVED | All job lines complete · status COMPLETED | Workshop marked the vehicle PICKED UP · job inactive | Workshop set status to COMPLETED',
       'status events: ' || (select string_agg(message, ' | ' order by at, id) from job_events e where e.job_id = '00000000-0000-0000-0000-0000000000c3' and kind = 'status');
end $$;

-- tracker
set role anon;
do $$ declare t jsonb; tok text; begin
  assert track_job('nope') is null, 'bad token';
  select track_job(track_token) into t from jobs where rego = '789GHI';
  raise exception 'should not be able to read jobs as anon';
exception when insufficient_privilege then null; end $$;
reset role;
create temp table tok as select track_token from jobs where rego = '789GHI';
grant select on tok to anon;
set role anon;
do $$ declare t jsonb; begin
  t := track_job((select track_token from tok));
  assert t->>'rego' = '789GHI' and t->>'status_reason' = 'completed', 'tracker data: ' || t::text;
  assert jsonb_array_length(t->'lines') = 2 and t->'lines'->0->>'state' = 'done', 'tracker lines: ' || (t->'lines')::text;
  assert t->>'completed_at' is not null, 'completed time';
  assert not (t ? 'customer_name') and not (t ? 'claim_number') and not (t ? 'stage'), 'no private fields';
end $$;
reset role;
\echo ALL WORKSHOP OS TESTS PASSED
