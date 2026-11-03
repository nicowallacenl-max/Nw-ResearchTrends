-- Rego type-ahead + lookup cache. Run after stub + migrations + seed.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111','admin@x') on conflict do nothing;
insert into app_users values ('11111111-1111-1111-1111-111111111111','admin@x','admin') on conflict do nothing;
insert into jobs (rego, make, model, colour, vin, customer_name, body_type, created_at) values
  ('ABC123', 'Mazda', 'CX-5', 'Soul Red', 'JM0KF123', 'Old owner', 'suv', now() - interval '30 days'),
  ('abc123', 'Mazda', 'CX-5', 'Soul Red', 'JM0KF123', 'New owner', 'suv', now()),
  ('ABD 999', 'Kia', 'Rio', null, null, null, 'hatch', now());
set request.jwt.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into plate_lookups (plate, state, found, make, model, body_type) values
  ('ABX777', 'QLD', true, 'TOYOTA', 'HILUX', 'dual_cab_ute'),
  ('ABC123', 'QLD', true, 'MAZDA', 'CX-5', 'suv'),          -- shadowed by the job row
  ('ABZ000', 'QLD', false, null, null, null);              -- misses are cached but never suggested
select string_agg(rego || ':' || source || ':' || coalesce(customer_name, '-'), ',' order by rego) as ab,
       (select count(*) from rego_suggestions('a')) as one_char,
       (select string_agg(rego, ',') from rego_suggestions('abd-9')) as dashed,
       (select rego from rego_suggestions('ab') limit 1) as first_ab,
       (select rego from rego_suggestions('abx777') limit 1) as exact_first
  from rego_suggestions('ab') \gset
reset role;
set role anon;
select count(*) as anon_n from (select 1 where false) x \gset
reset role;
\echo ab=:ab one_char=:one_char dashed=:dashed exact_first=:exact_first
select :'ab' = 'ABC123:job:New owner,ABD999:job:-,ABX777:lookup:-' and :'one_char' = '0' and :'dashed' = 'ABD999'
   and :'exact_first' = 'ABX777' as ok \gset
\if :ok
  \echo REGO SUGGESTIONS PASSED
\else
  \echo FAILED: rego suggestions
  select 1/0;
\endif
-- anon can't call it
set role anon;
do $$ begin
  begin perform * from rego_suggestions('ab'); raise exception 'anon called rego_suggestions';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo REGO ANON BLOCKED PASSED
