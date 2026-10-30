-- Job substatus. Run after stub + migrations + seed (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP on
create temp table ss as select j.rego, s.* from v_job_substatus s join jobs j on j.id = s.job_id;
do $$ begin
  assert (select substatus from ss where rego='123ABC') = 'not_started', 'camry: ' || (select substatus from ss where rego='123ABC');
  assert (select substatus from ss where rego='456DEF') = 'not_started';
end $$;
-- a "Switched job" pause (system reason) reads as idle, not paused
insert into work_segments (quote_line_id, technician_id, started_at, ended_at, end_type, delay_reason_id) values
 ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b1', now() - interval '5 hours', now() - interval '4 hours', 'paused', '00000000-0000-0000-0000-0000000000a7');
do $$ begin assert (select substatus from v_job_substatus where job_id='00000000-0000-0000-0000-0000000000c1') = 'idle'; end $$;
-- someone pauses the CX-5 for parts
insert into work_segments (quote_line_id, technician_id, started_at, ended_at, end_type, delay_reason_id) values
 ('00000000-0000-0000-0000-0000000001e1','00000000-0000-0000-0000-0000000000b3', now() - interval '3 hours', now() - interval '2 hours', 'paused', '00000000-0000-0000-0000-0000000000a1');
-- someone is working on the Ranger
insert into work_segments (quote_line_id, technician_id, started_at) values
 ('00000000-0000-0000-0000-0000000001f1','00000000-0000-0000-0000-0000000000b1', now() - interval '10 minutes');
-- i30 stopped at knock-off
insert into work_segments (quote_line_id, technician_id, started_at, ended_at, end_type) values
 ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-0000000000b2', now() - interval '20 hours', now() - interval '15 hours', 'auto_closed');
do $$ begin
  assert (select substatus || '|' || reason from v_job_substatus where job_id='00000000-0000-0000-0000-0000000000c2') = 'paused|Waiting on parts';
  assert (select substatus || '|' || working_count from v_job_substatus where job_id='00000000-0000-0000-0000-0000000000c3') = 'working|1';
  assert (select substatus from v_job_substatus where job_id='00000000-0000-0000-0000-0000000000c4') = 'stopped';
  -- resuming the CX-5 flips it to working
  insert into work_segments (quote_line_id, technician_id) values ('00000000-0000-0000-0000-0000000001e1','00000000-0000-0000-0000-0000000000b3');
  assert (select substatus from v_job_substatus where job_id='00000000-0000-0000-0000-0000000000c2') = 'working';
end $$;
\echo ALL SUBSTATUS TESTS PASSED
