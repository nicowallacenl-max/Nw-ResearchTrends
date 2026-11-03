-- Helper COMPLETE = "finished helping": stops the helper's timer (system reason, not a delay),
-- logs it, keeps the item open, and lets the owner complete it. Run after stub + migrations + seed.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@x') on conflict do nothing;
insert into app_users values ('11111111-1111-1111-1111-111111111111','admin@x','admin') on conflict do nothing;
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select pair_kiosk_device('Test tablet') as key \gset
reset role;

\set sam '''00000000-0000-0000-0000-0000000000b1'''
\set tom '''00000000-0000-0000-0000-0000000000b3'''
\set repair1 '''00000000-0000-0000-0000-0000000001d2'''

set role anon;
select kiosk_start(:'key', :sam, '1111', :repair1)->>'role' as owner_role,
       kiosk_start(:'key', :tom, '3333', :repair1, 'two-person job')->>'role' as helper_role \gset
select kiosk_complete(:'key', :sam, '1111', :repair1)->>'error' as blocked,
       kiosk_complete(:'key', :tom, '3333', :repair1) as helper_done \gset
reset role;
select state as state_after_helper from v_quote_line_state where quote_line_id = :repair1 \gset
set role anon;
select kiosk_complete(:'key', :tom, '3333', :repair1)->>'error' as helper_again,
       (kiosk_complete(:'key', :sam, '1111', :repair1)->>'ok')::boolean as owner_ok \gset
reset role;
select (select completed_at is not null from quote_lines where id = :repair1) as line_done,
       exists (select 1 from v_job_activity where message = 'Tom (all-rounder) finished helping on Left guard - repair') as logged,
       not exists (select 1 from v_delay_losses where delay_reason = 'Finished helping') as not_a_delay \gset

\echo owner=:owner_role helper=:helper_role blocked=:blocked helper_done=:helper_done state=:state_after_helper again=:helper_again owner_ok=:owner_ok line_done=:line_done logged=:logged not_a_delay=:not_a_delay
select :'owner_role' = 'owner' and :'helper_role' = 'helper' and :'blocked' = 'helpers_running'
   and (:'helper_done'::jsonb->>'helper_done')::boolean and :'state_after_helper' = 'running'
   and :'helper_again' = 'not_owner' and :'owner_ok'::boolean and :'line_done'::boolean and :'logged'::boolean and :'not_a_delay'::boolean as all_ok \gset
\if :all_ok
  \echo HELPER COMPLETE PASSED
\else
  \echo FAILED: helper complete
  select 1/0;
\endif
