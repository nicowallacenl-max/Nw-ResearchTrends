-- Kiosk clock rules. Run after stub + migrations + seed (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP on
-- pair a device (as admin)
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@x') on conflict do nothing;
insert into app_users values ('11111111-1111-1111-1111-111111111111','admin@x','admin') on conflict do nothing;
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select pair_kiosk_device('Test tablet') as key \gset
reset role;
select set_config('my.key', :'key', false);

set role anon;
do $$ declare b jsonb; begin
  b := kiosk_board('nope-nope-nope-nope-nope-nope-nope-nope');
  assert b->>'error' = 'not_paired', 'bad key accepted';
end $$;
-- anon can't read tables or internal helpers directly
do $$ begin
  begin perform * from jobs; raise exception 'anon read jobs'; exception when insufficient_privilege then null; end;
  begin perform kiosk_auth('x', null, null); raise exception 'anon called kiosk_auth'; exception when insufficient_privilege then null; end;
end $$;

\set sam '''00000000-0000-0000-0000-0000000000b1'''
\set jess '''00000000-0000-0000-0000-0000000000b2'''
\set tom '''00000000-0000-0000-0000-0000000000b3'''
\set repair1 '''00000000-0000-0000-0000-0000000001d2'''
\set prep1 '''00000000-0000-0000-0000-0000000001d3'''
\set strip2 '''00000000-0000-0000-0000-0000000001e1'''
\set ranger_repair '''00000000-0000-0000-0000-0000000001f1'''
\set parts '''00000000-0000-0000-0000-0000000000a1'''

create temp table r (k text, v jsonb);
grant all on r to anon;
insert into r select 'board', kiosk_board(:'key');
insert into r select 'wrongpin', kiosk_start(:'key', :sam, '0000', :repair1);
insert into r select 'locked', kiosk_start(:'key', :jess, '2222', :prep1);
insert into r select 'start', kiosk_start(:'key', :sam, '1111', :repair1);
insert into r select 'again', kiosk_start(:'key', :sam, '1111', :repair1);
insert into r select 'helper_noreason', kiosk_start(:'key', :tom, '3333', :repair1);
insert into r select 'helper', kiosk_start(:'key', :tom, '3333', :repair1, 'two-person job');
insert into r select 'complete_blocked', kiosk_complete(:'key', :sam, '1111', :repair1);
insert into r select 'not_owner', kiosk_complete(:'key', :tom, '3333', :repair1);
insert into r select 'switch', kiosk_start(:'key', :tom, '3333', :strip2);
insert into r select 'pause_noreason', kiosk_pause(:'key', :tom, '3333', null);
insert into r select 'pause', kiosk_pause(:'key', :tom, '3333', :parts);
insert into r select 'pause_again', kiosk_pause(:'key', :tom, '3333', :parts);
insert into r select 'complete', kiosk_complete(:'key', :sam, '1111', :repair1);
insert into r select 'prep_now_ready', kiosk_start(:'key', :jess, '2222', :prep1);
reset role;

do $$ declare x record; begin
  for x in select k, v from r loop raise notice '% -> %', rpad(x.k, 18), left(x.v::text, 120); end loop;
end $$;

do $$ begin
  assert (select (v->'jobs')::text like '%123ABC%' from r where k='board'), 'board missing jobs';
  assert (select v->>'error' from r where k='wrongpin') = 'wrong_pin';
  assert (select v->>'error' from r where k='locked') = 'line_locked';
  assert (select v->>'role' from r where k='start') = 'owner';
  assert (select v->>'error' from r where k='again') = 'already_running';
  assert (select v->>'error' from r where k='helper_noreason') = 'helper_reason_required';
  assert (select v->>'role' from r where k='helper') = 'helper';
  assert (select v->>'error' from r where k='complete_blocked') = 'helpers_running';
  assert (select v->>'error' from r where k='not_owner') = 'not_owner';
  assert (select v->>'switched_from' from r where k='switch') = 'Left guard - repair';
  assert (select v->>'error' from r where k='pause_noreason') = 'reason_required';
  assert (select (v->>'ok')::boolean from r where k='pause');
  assert (select v->>'error' from r where k='pause_again') = 'not_running';
  assert (select (v->>'ok')::boolean from r where k='complete');
  assert (select (v->>'ok')::boolean from r where k='prep_now_ready');
  -- data checks
  assert (select completed_at is not null from quote_lines where id='00000000-0000-0000-0000-0000000001d2');
  assert (select count(*) from work_segments where ended_at is null) = 1, 'only Jess should be running';
  assert exists (select 1 from work_segments w join delay_reasons d on d.id=w.delay_reason_id
                 where d.label='Switched job' and w.technician_id='00000000-0000-0000-0000-0000000000b3'
                   and w.quote_line_id='00000000-0000-0000-0000-0000000001d2'), 'switch not recorded';
  assert (select status from jobs where rego='456DEF') = 'in_progress', 'job not marked in progress';
end $$;

-- wrong PINs via the kiosk still count towards lockout
do $$ declare i int; s text; begin
  for i in 1..5 loop s := kiosk_start(current_setting('my.key'), '00000000-0000-0000-0000-0000000000b3', '9999', '00000000-0000-0000-0000-0000000001f1')->>'error'; end loop;
  assert s = 'locked', 'kiosk lockout: ' || s;
end $$;

-- helper policy: not allowed
update settings set helper_policy = 'not_allowed';
do $$ begin
  assert kiosk_start(current_setting('my.key'), '00000000-0000-0000-0000-0000000000b1', '1111', '00000000-0000-0000-0000-0000000001d3', 'training')->>'error' = 'helpers_not_allowed';
end $$;
-- helper policy: owner approval (Jess owns prep)
update settings set helper_policy = 'owner_approval';
do $$ declare k text := current_setting('my.key'); begin
  assert kiosk_start(k, '00000000-0000-0000-0000-0000000000b1', '1111', '00000000-0000-0000-0000-0000000001d3', 'training')->>'error' = 'owner_approval_required';
  assert kiosk_start(k, '00000000-0000-0000-0000-0000000000b1', '1111', '00000000-0000-0000-0000-0000000001d3', 'training', '1111')->>'error' = 'owner_wrong_pin';
  assert kiosk_start(k, '00000000-0000-0000-0000-0000000000b1', '1111', '00000000-0000-0000-0000-0000000001d3', 'training', '2222')->>'role' = 'helper';
end $$;
update settings set helper_policy = 'allowed';

-- revoked device stops working
update kiosk_devices set revoked_at = now();
do $$ begin assert kiosk_board(current_setting('my.key'))->>'error' = 'not_paired', 'revoked device still works'; end $$;
\echo ALL KIOSK TESTS PASSED
