-- Run after stub_supabase.sql + migrations + seed. Any failure raises and aborts (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP on
create or replace procedure pg_temp.expect_fail(sql text, label text) language plpgsql as $$
begin
  begin execute sql; raise exception 'EXPECTED FAILURE DID NOT HAPPEN: %', label;
  exception when raise_exception then
    if sqlerrm like 'EXPECTED FAILURE%' then raise; end if;
  when others then null; end;
  raise notice 'ok  - %', label;
end $$;

-- one running segment per technician
insert into work_segments (quote_line_id, technician_id) values ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b1');
call pg_temp.expect_fail($$insert into work_segments (quote_line_id, technician_id) values ('00000000-0000-0000-0000-0000000001d3','00000000-0000-0000-0000-0000000000b1')$$, 'second running segment rejected');
-- pause requires reason
call pg_temp.expect_fail($$update work_segments set ended_at=now(), end_type='paused' where ended_at is null$$, 'pause without reason rejected');
-- helper cannot complete / needs reason
call pg_temp.expect_fail($$insert into work_segments (quote_line_id, technician_id, role) values ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b3','helper')$$, 'helper without reason rejected');
call pg_temp.expect_fail($$insert into work_segments (quote_line_id, technician_id, role, helper_reason, ended_at, end_type) values ('00000000-0000-0000-0000-0000000001d2','00000000-0000-0000-0000-0000000000b3','helper','training', now()+interval '1h','completed')$$, 'helper complete rejected');
-- never deleted
call pg_temp.expect_fail($$delete from work_segments$$, 'segment delete blocked');
-- auto_close flags for review
update work_segments set ended_at = now(), end_type='auto_closed' where ended_at is null;
do $$ begin assert (select count(*) from v_review_queue) = 1, 'auto_closed not queued'; end $$;
-- audit: correction keeps originals
update work_segments set started_at = started_at - interval '1 hour' where end_type='auto_closed';
do $$ begin assert (select original_started_at is not null from work_segments where end_type='auto_closed'), 'original not kept'; end $$;
call pg_temp.expect_fail($$update work_segments set original_started_at = now() where end_type='auto_closed'$$, 'originals immutable');

-- unlock chain: job1 strip done -> repair ready, prep/paint/refit locked
do $$ begin
  assert (select state from v_quote_line_state where quote_line_id='00000000-0000-0000-0000-0000000001d2')='ready';
  assert (select state from v_quote_line_state where quote_line_id='00000000-0000-0000-0000-0000000001d3')='locked';
  assert (select state from v_quote_line_state where quote_line_id='00000000-0000-0000-0000-0000000001f1')='ready'; -- job3 has no strip
  assert (select state from v_quote_line_state where quote_line_id='00000000-0000-0000-0000-0000000001d1')='done';
end $$;
-- hours / helper / delay views
do $$ begin
  assert round((select actual_hours from v_line_actuals where quote_line_id='00000000-0000-0000-0000-0000000001d1')::numeric,2)=2.00, 'strip actual';
  assert (select helper_hours from v_line_actuals where quote_line_id='00000000-0000-0000-0000-0000000001d2') > 1.4, 'helper hours';
  assert (select count(*) from v_helper_report)=1, 'helper report';
  assert (select hours_lost from v_delay_by_reason where delay_reason='Waiting on parts') > 4, 'delay lost';
  assert not exists (select 1 from v_delay_by_reason where delay_reason='Switched job'), 'system reason excluded';
  assert (select board_colour from v_job_summary where rego='123ABC')='red', 'job colour';
end $$;

-- PIN lockout
do $$ declare r text; i int; begin
  assert public.verify_technician_pin('00000000-0000-0000-0000-0000000000b2','2222')='ok';
  for i in 1..4 loop assert public.verify_technician_pin('00000000-0000-0000-0000-0000000000b2','0000')='wrong_pin'; end loop;
  assert public.verify_technician_pin('00000000-0000-0000-0000-0000000000b2','0000')='locked', '5th wrong locks';
  assert public.verify_technician_pin('00000000-0000-0000-0000-0000000000b2','2222')='locked', 'correct PIN while locked';
  update technicians set locked_until = now() - interval '1 second' where id='00000000-0000-0000-0000-0000000000b2';
  assert public.verify_technician_pin('00000000-0000-0000-0000-0000000000b2','2222')='ok', 'unlock after window';
end $$;

-- RLS
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@x'),('22222222-2222-2222-2222-222222222222','owner@x');
insert into app_users values ('11111111-1111-1111-1111-111111111111','admin@x','admin'),('22222222-2222-2222-2222-222222222222','owner@x','owner');
set role authenticated;
set request.jwt.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from jobs)=4, 'owner reads jobs';
  assert (select count(*) from v_job_summary)=4, 'owner reads views';
end $$;
call pg_temp.expect_fail($$insert into jobs (rego) values ('X')$$, 'owner cannot write');
call pg_temp.expect_fail($$select pin_hash from technicians$$, 'pin_hash hidden from browser sessions');
call pg_temp.expect_fail($$select public.verify_technician_pin('00000000-0000-0000-0000-0000000000b1','1111')$$, 'authenticated cannot call verify_pin');
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
insert into jobs (rego) values ('ADMIN1');
do $$ declare id uuid; begin id := public.create_technician('New', 30, '{paint}', '4444'); assert id is not null; end $$;
reset role;
set role anon;
call pg_temp.expect_fail($$select * from jobs$$, 'anon has no access');
reset role;
do $$ begin assert public.verify_technician_pin((select id from technicians where name='New'),'4444')='ok'; end $$;
\echo ALL SMOKE TESTS PASSED
