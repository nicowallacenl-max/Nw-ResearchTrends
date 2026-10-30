-- Derived figures. Views, not stored. security_invoker so the caller's RLS applies.
-- A running segment counts up to now().

-- Hours per segment (+ cost at the technician's rate).
create view public.v_segment_hours with (security_invoker = true) as
select
  s.id as segment_id,
  s.quote_line_id,
  s.technician_id,
  s.role,
  s.started_at,
  s.ended_at,
  s.end_type,
  extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 3600.0 as hours,
  extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) / 3600.0 * t.hourly_cost_rate as cost
from public.work_segments s
join public.technicians t on t.id = s.technician_id;

-- Actual vs quoted per quote line. Helper time counts towards actuals and cost.
create view public.v_line_actuals with (security_invoker = true) as
select
  q.id as quote_line_id,
  q.job_id,
  q.description,
  q.procedure,
  q.assigned_technician_id,
  q.quoted_hours,
  coalesce(sum(h.hours), 0)                                         as actual_hours,
  coalesce(sum(h.hours) filter (where h.role = 'helper'), 0)        as helper_hours,
  coalesce(sum(h.cost), 0)                                          as labour_cost,
  coalesce(sum(h.hours), 0) - q.quoted_hours                        as variance_hours,
  case when q.quoted_hours > 0 then coalesce(sum(h.hours), 0) / q.quoted_hours end as pct_of_quoted,
  q.completed_at
from public.quote_lines q
left join public.v_segment_hours h on h.quote_line_id = q.id
group by q.id;

-- Lock state: a line is locked while any EARLIER procedure in the same job is incomplete.
-- (Procedures the quote doesn't need simply don't appear, so they never block.)
create view public.v_quote_line_state with (security_invoker = true) as
select
  q.id as quote_line_id,
  q.job_id,
  q.procedure,
  q.assigned_technician_id,
  case
    when q.completed_at is not null then 'done'
    when exists (
      select 1 from public.quote_lines p
      where p.job_id = q.job_id
        and public.procedure_order(p.procedure) < public.procedure_order(q.procedure)
        and p.completed_at is null
    ) then 'locked'
    when exists (select 1 from public.work_segments s where s.quote_line_id = q.id and s.ended_at is null) then 'running'
    else 'ready'
  end as state
from public.quote_lines q;

-- Per job: quoted vs actual hours, labour cost vs quoted labour, and wall-board colour.
-- Quoted labour is priced at the assigned owner's rate.
create view public.v_job_summary with (security_invoker = true) as
select
  j.id as job_id,
  j.rego, j.make, j.model, j.colour, j.status,
  sum(a.quoted_hours)                                   as quoted_hours,
  sum(a.actual_hours)                                   as actual_hours,
  sum(a.actual_hours) - sum(a.quoted_hours)             as variance_hours,
  sum(a.labour_cost)                                    as labour_cost,
  sum(a.quoted_hours * coalesce(t.hourly_cost_rate, 0)) as quoted_labour_cost,
  case
    when bool_or(a.quoted_hours > 0 and a.actual_hours > a.quoted_hours) then 'red'
    when bool_or(a.quoted_hours > 0 and a.actual_hours >= a.quoted_hours * (select warn_pct from public.settings) / 100.0) then 'amber'
    else 'green'
  end as board_colour
from public.jobs j
join public.v_line_actuals a on a.job_id = j.id
left join public.technicians t on t.id = a.assigned_technician_id
group by j.id;

-- Quoted vs actual by technician (hours they logged vs quoted hours of lines they own).
create view public.v_technician_summary with (security_invoker = true) as
select
  t.id as technician_id,
  t.name,
  coalesce(sum(h.hours), 0) as hours_logged,
  coalesce(sum(h.hours) filter (where h.role = 'owner'),  0) as owner_hours,
  coalesce(sum(h.hours) filter (where h.role = 'helper'), 0) as helper_hours,
  coalesce(sum(h.cost), 0)  as labour_cost,
  (select coalesce(sum(q.quoted_hours), 0) from public.quote_lines q where q.assigned_technician_id = t.id) as quoted_hours_owned
from public.technicians t
left join public.v_segment_hours h on h.technician_id = t.id
group by t.id;

-- Quoted vs actual by procedure (replaces generic "category").
create view public.v_procedure_summary with (security_invoker = true) as
select
  procedure,
  sum(quoted_hours) as quoted_hours,
  sum(actual_hours) as actual_hours,
  sum(actual_hours) - sum(quoted_hours) as variance_hours
from public.v_line_actuals
group by procedure;

-- Hours lost per delay reason. A pause's lost time = from the pause until the next segment on
-- the same line starts (or until now, if the line is still waiting and not complete).
-- App-generated "switched job" pauses are excluded: the technician moved on, nothing was lost.
create view public.v_delay_losses with (security_invoker = true) as
select
  s.id as segment_id,
  s.quote_line_id,
  q.job_id,
  q.procedure,
  r.id as delay_reason_id,
  r.label as delay_reason,
  s.ended_at as paused_at,
  nxt.started_at as resumed_at,
  extract(epoch from (coalesce(nxt.started_at, case when q.completed_at is null then now() end) - s.ended_at)) / 3600.0 as hours_lost
from public.work_segments s
join public.delay_reasons r on r.id = s.delay_reason_id and not r.system
join public.quote_lines q on q.id = s.quote_line_id
left join lateral (
  select n.started_at from public.work_segments n
  where n.quote_line_id = s.quote_line_id and n.started_at >= s.ended_at
  order by n.started_at limit 1
) nxt on true
where s.end_type = 'paused';

create view public.v_delay_by_reason with (security_invoker = true) as
select
  delay_reason_id, delay_reason,
  count(*) as pauses,
  coalesce(sum(hours_lost), 0) as hours_lost,
  coalesce(sum(hours_lost) filter (where paused_at >= date_trunc('week',  now())), 0) as hours_lost_this_week,
  coalesce(sum(hours_lost) filter (where paused_at >= date_trunc('month', now())), 0) as hours_lost_this_month
from public.v_delay_losses
group by delay_reason_id, delay_reason;

-- Helper report: how often helpers were used, by reason / procedure / owner.
create view public.v_helper_report with (security_invoker = true) as
select
  s.helper_reason,
  q.procedure,
  q.assigned_technician_id as owner_id,
  o.name as owner_name,
  count(*) as helper_segments,
  count(distinct s.technician_id) as distinct_helpers,
  sum(h.hours) as helper_hours,
  sum(h.cost)  as helper_cost
from public.work_segments s
join public.v_segment_hours h on h.segment_id = s.id
join public.quote_lines q on q.id = s.quote_line_id
left join public.technicians o on o.id = q.assigned_technician_id
where s.role = 'helper'
group by s.helper_reason, q.procedure, q.assigned_technician_id, o.name;

-- Open assigned hours per technician: input for auto-assignment ("fewest open hours").
create view public.v_technician_open_hours with (security_invoker = true) as
select
  t.id as technician_id, t.name, t.procedures, t.active,
  coalesce(sum(greatest(a.quoted_hours - a.actual_hours, 0)) filter (where a.completed_at is null), 0) as open_hours
from public.technicians t
left join public.v_line_actuals a on a.assigned_technician_id = t.id
group by t.id;

-- Segments waiting for admin review (auto-closed or flagged).
create view public.v_review_queue with (security_invoker = true) as
select s.*, t.name as technician_name, q.description, j.rego
from public.work_segments s
join public.technicians t on t.id = s.technician_id
join public.quote_lines q on q.id = s.quote_line_id
join public.jobs j on j.id = q.job_id
where s.needs_review and s.reviewed_at is null;
