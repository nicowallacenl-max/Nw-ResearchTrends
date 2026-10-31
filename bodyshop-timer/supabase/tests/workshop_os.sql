-- Job numbers, stage automation + events, activity, tracker. Run after stub + migrations + seed.
\set ON_ERROR_STOP on
do $$ begin
  assert (select count(*) from jobs where job_number like 'AB-%') = 4, 'job numbers';
  assert (select count(distinct track_token) from jobs) = 4 and (select min(length(track_token)) from jobs) = 32, 'tokens';
  assert (select count(*) from jobs where stage = 0) = 4, 'seed jobs start at Assess (no work yet)';
  assert (select count(*) from job_events where kind = 'created') = 4, 'created events';
end $$;
-- Ranger: repair (Tom) -> paint (Jess). Starting work jumps to Panel; completing repair -> Paint; completing paint -> QC & Ready
insert into work_segments (quote_line_id, technician_id) values ('00000000-0000-0000-0000-0000000001f1','00000000-0000-0000-0000-0000000000b3');
do $$ begin assert (select stage from jobs where rego='789GHI') = 3, 'start -> Panel: ' || (select stage from jobs where rego='789GHI'); end $$;
update work_segments set ended_at = now(), end_type = 'completed' where ended_at is null;
update quote_lines set completed_at = now() where id = '00000000-0000-0000-0000-0000000001f1';
do $$ begin assert (select stage from jobs where rego='789GHI') = 4, 'repair done -> Paint'; end $$;
update quote_lines set completed_at = now() where id = '00000000-0000-0000-0000-0000000001f2';
do $$ begin assert (select stage from jobs where rego='789GHI') = 6, 'all done -> QC & Ready'; end $$;
-- office marks complete; automation never moves it back
update jobs set stage = 7 where rego = '789GHI';
update quote_lines set completed_at = now() where id = '00000000-0000-0000-0000-0000000001f2';
do $$ begin
  assert (select stage from jobs where rego='789GHI') = 7, 'stays complete';
  assert (select count(*) from job_events e join jobs j on j.id = e.job_id where j.rego = '789GHI' and e.kind = 'stage') = 4, 'stage events (Panel, Paint, QC & Ready, Complete)';
  assert (select count(*) from v_job_activity a join jobs j on j.id = a.job_id where j.rego = '789GHI') = 7, 'activity rows: '
    || (select count(*) from v_job_activity a join jobs j on j.id = a.job_id where j.rego = '789GHI');
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
  assert t->>'rego' = '789GHI' and (t->>'stage')::int = 7, 'tracker data';
  assert jsonb_array_length(t->'stage_times') = 8 and t->'stage_times'->>7 is not null and t->'stage_times'->>1 is not null, 'stage times: ' || (t->'stage_times')::text;
  assert not (t ? 'customer_name') and not (t ? 'claim_number'), 'no private fields';
end $$;
reset role;
\echo ALL WORKSHOP OS TESTS PASSED
