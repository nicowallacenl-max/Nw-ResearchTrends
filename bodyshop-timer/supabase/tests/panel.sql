-- Panel sits between Strip and Repair in the unlock chain. Run after stub + migrations + seed.
\set ON_ERROR_STOP on
insert into jobs (id, rego) values ('dddddddd-0000-0000-0000-000000000001', 'PANEL1');
insert into quote_lines (id, job_id, description, procedure, quoted_hours) values
  ('dddddddd-0000-0000-0000-0000000000a1', 'dddddddd-0000-0000-0000-000000000001', 'Strip', 'strip', 0),
  ('dddddddd-0000-0000-0000-0000000000a2', 'dddddddd-0000-0000-0000-000000000001', 'Panel', 'panel', 0),
  ('dddddddd-0000-0000-0000-0000000000a3', 'dddddddd-0000-0000-0000-000000000001', 'Repair', 'repair', 0);
select string_agg(procedure || ':' || state, ',' order by procedure_order(procedure)) as before
  from v_quote_line_state where job_id = 'dddddddd-0000-0000-0000-000000000001' \gset
update quote_lines set completed_at = now() where id = 'dddddddd-0000-0000-0000-0000000000a1';
select string_agg(procedure || ':' || state, ',' order by procedure_order(procedure)) as after_strip
  from v_quote_line_state where job_id = 'dddddddd-0000-0000-0000-000000000001' \gset
update quote_lines set completed_at = now() where id = 'dddddddd-0000-0000-0000-0000000000a2';
select string_agg(procedure || ':' || state, ',' order by procedure_order(procedure)) as after_panel
  from v_quote_line_state where job_id = 'dddddddd-0000-0000-0000-000000000001' \gset
select string_agg(e::text, ',') as order_ from unnest(enum_range(null::procedure_type)) e \gset
select string_agg(name, ',' order by name) as panel_techs from technicians where 'panel' = any (procedures) \gset
\echo order=:order_ before=:before after_strip=:after_strip after_panel=:after_panel panel_techs=:panel_techs
select :'order_' = 'strip,panel,repair,prep,paint,refit'
   and :'before' = 'strip:ready,panel:locked,repair:locked'
   and :'after_strip' = 'strip:done,panel:ready,repair:locked'
   and :'after_panel' = 'strip:done,panel:done,repair:ready' as ok \gset
\if :ok
  \echo PANEL TESTS PASSED
\else
  \echo FAILED: panel
  select 1/0;
\endif
