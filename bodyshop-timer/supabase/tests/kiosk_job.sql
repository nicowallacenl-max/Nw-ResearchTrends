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
  assert (b->'jobs'->0) ? 'job_number' and (b->'jobs'->0) ? 'stage' and (b->'jobs'->0) ? 'bay', 'board job fields';
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
  assert (r->>'ok')::boolean, 'complete: ' || r::text;
  assert exists (select 1 from jsonb_array_elements(kiosk_job(k, '00000000-0000-0000-0000-0000000000c3')->'activity') e
                 where e->>'message' like 'Tom% completed Tailgate - repair'), 'completion logged';
end $$;
reset role;
\echo ALL KIOSK JOB TESTS PASSED
