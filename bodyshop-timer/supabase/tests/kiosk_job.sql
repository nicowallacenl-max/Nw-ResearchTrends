-- Wall board job view. Run after stub + migrations + seed.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@x') on conflict do nothing;
insert into app_users values ('11111111-1111-1111-1111-111111111111','admin@x','admin') on conflict do nothing;
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select pair_kiosk_device('T') as key \gset
reset role;
select set_config('my.key', :'key', false);
insert into job_damage (job_id, panel, type) values ('00000000-0000-0000-0000-0000000000c1', 'bonnet', 'dent');
insert into job_photos (job_id, path, caption) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1/a.jpg', 'Bonnet');
set role anon;
do $$ declare b jsonb; j jsonb; k text := current_setting('my.key'); begin
  b := kiosk_board(k);
  assert (b->'jobs'->0) ? 'job_number' and (b->'jobs'->0) ? 'status_reason' and (b->'jobs'->0) ? 'bay', 'board job fields';
  j := kiosk_job(k, '00000000-0000-0000-0000-0000000000c1');
  assert (j->>'ok')::boolean, 'kiosk_job ok';
  assert jsonb_array_length(j->'damage') = 1 and jsonb_array_length(j->'photos') = 1, 'damage + photos';
  assert jsonb_array_length(j->'activity') >= 1, 'activity';
  assert not (j->'job' ? 'customer_name'), 'no customer details';
  assert kiosk_job('bad-key-bad-key-bad-key-bad-key-bad-key', '00000000-0000-0000-0000-0000000000c1')->>'error' = 'not_paired', 'bad key';
end $$;
reset role;
-- complete while not clocked on -> activity line
set role anon;
do $$ declare k text := current_setting('my.key'); r jsonb; begin
  r := kiosk_start(k, '00000000-0000-0000-0000-0000000000b3', '3333', '00000000-0000-0000-0000-0000000001f1');
  assert (r->>'ok')::boolean, 'start: ' || r::text;
  r := kiosk_pause(k, '00000000-0000-0000-0000-0000000000b3', '3333', '00000000-0000-0000-0000-0000000000a1');
  r := kiosk_complete(k, '00000000-0000-0000-0000-0000000000b3', '3333', '00000000-0000-0000-0000-0000000001f1');
  assert r->>'error' = 'line_paused', 'complete while paused should be refused: ' || r::text;
  assert (kiosk_board(k)->'jobs') @> '[{"lines":[{"state":"paused","pause_reason":"Waiting on parts"}]}]', 'board shows paused line';
  r := kiosk_start(k, '00000000-0000-0000-0000-0000000000b3', '3333', '00000000-0000-0000-0000-0000000001f1');  -- resume
  assert (r->>'ok')::boolean, 'resume: ' || r::text;
  r := kiosk_complete(k, '00000000-0000-0000-0000-0000000000b3', '3333', '00000000-0000-0000-0000-0000000001f1');
  assert (r->>'ok')::boolean, 'complete after resume: ' || r::text;
  assert exists (select 1 from jsonb_array_elements(kiosk_job(k, '00000000-0000-0000-0000-0000000000c3')->'activity') e
                 where e->>'message' like 'Tom% completed Tailgate - repair'), 'completion logged';
end $$;
reset role;
-- board only shows approved jobs due in today or earlier; review jobs can't be clocked on to
update jobs set status_reason = 'review' where rego = '456DEF';
update jobs set due_in = current_date + 3 where rego = '321JKL';
update jobs set due_in = current_date - 1 where rego = '123ABC';
set role anon;
do $$ declare k text := current_setting('my.key'); b jsonb; r jsonb; begin
  b := kiosk_board(k)->'jobs';
  assert not (b @> '[{"rego":"456DEF"}]'), 'review job hidden from board';
  assert not (b @> '[{"rego":"321JKL"}]'), 'future due-in hidden from board';
  assert b @> '[{"rego":"123ABC"}]', 'overdue due-in shown';
  assert b @> '[{"rego":"789GHI"}]', 'no due-in date shown';
  r := kiosk_start(k, '00000000-0000-0000-0000-0000000000b1', '1111', '00000000-0000-0000-0000-0000000001e1');
  assert r->>'error' = 'job_not_approved', 'start on review job: ' || r::text;
end $$;
reset role;
\echo ALL KIOSK JOB TESTS PASSED
