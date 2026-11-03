-- Due dates + calendar. Run after stub + migrations + seed.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@x') on conflict do nothing;
insert into app_users values ('11111111-1111-1111-1111-111111111111','admin@x','admin') on conflict do nothing;
do $$ declare d date := (now() at time zone 'Australia/Brisbane')::date; begin
  update jobs set due_in = d, due_out = d + 3 where rego = '123ABC';      -- arrives today, out in 3 days
  update jobs set due_in = d + 1, due_out = d + 8 where rego = '456DEF';  -- tomorrow / next week
  update jobs set due_out = d - 2 where rego = '789GHI';                  -- overdue (not done)
  update jobs set due_out = d + 40 where rego = '321JKL';                 -- outside the range
end $$;
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
do $$ declare c jsonb; d date := (now() at time zone 'Australia/Brisbane')::date; regos text; begin
  c := calendar_jobs(d, d + 6);
  assert (c->>'today')::date = d, 'today';
  select string_agg(e->>'rego', ',' order by e->>'rego') into regos from jsonb_array_elements(c->'jobs') e;
  assert regos = '123ABC,456DEF,789GHI', 'this week + overdue: ' || regos;
  assert (c->'jobs'->0) ? 'lines' and (c->'jobs'->0) ? 'due_in', 'job shape';
end $$;
reset role;
set role anon;
do $$ begin
  begin perform calendar_jobs(current_date, current_date); raise exception 'anon called calendar_jobs'; exception when insufficient_privilege then null; end;
  assert kiosk_calendar('bad-key-bad-key-bad-key-bad-key-bad-key', current_date, current_date)->>'error' = 'not_paired', 'kiosk key';
end $$;
reset role;
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select pair_kiosk_device('T') as key \gset
reset role;
set role anon;
select (kiosk_calendar(:'key', (now() at time zone 'Australia/Brisbane')::date + 7, (now() at time zone 'Australia/Brisbane')::date + 13)->'jobs') as next_week \gset
reset role;
select :'next_week'::jsonb @> '[{"rego":"456DEF"}]' and :'next_week'::jsonb @> '[{"rego":"789GHI"}]' as cal_ok,
       (kiosk_board(:'key')->'jobs') @> '[{"rego":"123ABC"}]' and (kiosk_board(:'key')->'jobs'->0) ? 'due_out' as board_ok \gset
\if :cal_ok
\else
  \echo FAILED: kiosk calendar next week + overdue
  select 1/0;
\endif
\if :board_ok
\else
  \echo FAILED: board carries due dates
  select 1/0;
\endif
-- tracker uses due_out
do $$ begin assert (track_job((select track_token from jobs where rego='123ABC'))) ? 'due_out', 'tracker due_out'; end $$;
\echo ALL CALENDAR TESTS PASSED
