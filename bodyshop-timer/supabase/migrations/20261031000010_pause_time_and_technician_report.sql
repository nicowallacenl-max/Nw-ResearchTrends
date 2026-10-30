-- Pause time counts working hours only: from the pause until the item is resumed (by anyone),
-- completed, or now, but never past knock-off on the day of the pause. A pause that starts after
-- knock-off counts as zero. (Before this, an overnight pause counted the whole night.)
-- Same columns as before, plus technician_id at the end.
create or replace view public.v_delay_losses with (security_invoker = true) as
select
  s.id as segment_id,
  s.quote_line_id,
  q.job_id,
  q.procedure,
  r.id as delay_reason_id,
  r.label as delay_reason,
  s.ended_at as paused_at,
  nxt.started_at as resumed_at,
  greatest(0, extract(epoch from (least(coalesce(nxt.started_at, q.completed_at, now()), k.knock_off) - s.ended_at)) / 3600.0) as hours_lost,
  s.technician_id
from public.work_segments s
join public.delay_reasons r on r.id = s.delay_reason_id and not r.system
join public.quote_lines q on q.id = s.quote_line_id
cross join public.settings st
cross join lateral (
  select ((s.ended_at at time zone st.time_zone)::date + st.knock_off_time) at time zone st.time_zone as knock_off
) k
left join lateral (
  select n.started_at from public.work_segments n
  where n.quote_line_id = s.quote_line_id and n.started_at >= s.ended_at
  order by n.started_at limit 1
) nxt on true
where s.end_type = 'paused';

-- One row per timer with its job, hours, cost and (for pauses) the pause time that followed.
-- The Technician jobs report aggregates this per technician and per job for a chosen period.
create view public.v_technician_segments with (security_invoker = true) as
select
  h.segment_id,
  h.technician_id,
  t.name as technician_name,
  q.job_id,
  j.rego,
  q.id as quote_line_id,
  q.description,
  q.procedure,
  h.role,
  h.started_at,
  h.ended_at,
  h.end_type,
  h.hours,
  h.cost,
  d.delay_reason,
  coalesce(d.hours_lost, 0) as pause_hours
from public.v_segment_hours h
join public.technicians t on t.id = h.technician_id
join public.quote_lines q on q.id = h.quote_line_id
join public.jobs j on j.id = q.job_id
left join public.v_delay_losses d on d.segment_id = h.segment_id;

grant select on public.v_technician_segments to authenticated;
