-- Panel work counts towards the "Panel" step of the automatic job stage, together with repair.
create or replace function public.derived_stage(p_job uuid) returns smallint
language sql stable security definer set search_path = public as $$
  with g(stage_idx, procs) as (
    values (2, array['strip']::public.procedure_type[]), (3, array['panel','repair']::public.procedure_type[]),
           (4, array['prep','paint']::public.procedure_type[]), (5, array['refit']::public.procedure_type[])
  ), st as (
    select g.stage_idx, count(q.id) as n, bool_and(q.completed_at is not null) as all_done
    from g left join public.quote_lines q on q.job_id = p_job and q.procedure = any (g.procs)
    group by g.stage_idx
  )
  select case
    when not exists (select 1 from public.work_segments w join public.quote_lines q on q.id = w.quote_line_id where q.job_id = p_job)
      then 0
    else coalesce((select min(stage_idx) from st where n > 0 and not all_done), 6)
  end::smallint;
$$;

-- Technicians who do repair are panel beaters: they can also take Panel lines (editable on the Technicians page).
update public.technicians
   set procedures = array_append(procedures, 'panel'::public.procedure_type)
 where 'repair' = any (procedures) and not ('panel' = any (procedures));
