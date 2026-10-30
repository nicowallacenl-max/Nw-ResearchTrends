-- Job substatus: derived from the timers, so the front office can see at a glance whether a job is
-- being worked on or has been paused (and why) without anyone having to keep it up to date.
--   not_started  no time logged yet
--   working      someone is clocked on
--   paused       the last timer was paused with a delay reason (reason + since)
--   stopped      the last timer was stopped by the knock-off clock-off
--   idle         the last timer ended otherwise (step completed, or the person switched jobs)
--   done         job is done
create view public.v_job_substatus with (security_invoker = true) as
select
  j.id as job_id,
  case
    when j.status = 'done' then 'done'
    when run.n > 0 then 'working'
    when last.id is null then 'not_started'
    when last.end_type = 'paused' and not coalesce(r.system, false) then 'paused'
    when last.end_type = 'auto_closed' then 'stopped'
    else 'idle'
  end as substatus,
  case when last.end_type = 'paused' and not coalesce(r.system, false) then r.label end as reason,
  case when run.n > 0 then run.since else last.ended_at end as since,
  run.n as working_count
from public.jobs j
cross join lateral (
  select count(distinct w.technician_id)::int as n, min(w.started_at) as since
  from public.work_segments w join public.quote_lines q on q.id = w.quote_line_id
  where q.job_id = j.id and w.ended_at is null
) run
left join lateral (
  select w.* from public.work_segments w join public.quote_lines q on q.id = w.quote_line_id
  where q.job_id = j.id and w.ended_at is not null
  order by w.ended_at desc limit 1
) last on true
left join public.delay_reasons r on r.id = last.delay_reason_id;

grant select on public.v_job_substatus to authenticated;

-- Wall board gets the substatus too.
create or replace function public.kiosk_board(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.kiosk_device_id(p_key) is null then return public.kiosk_err('not_paired'); end if;
  perform public.auto_clock_off();
  return jsonb_build_object(
    'ok', true,
    'now', now(),
    'settings', (select jsonb_build_object('helper_policy', helper_policy, 'warn_pct', warn_pct, 'time_zone', time_zone) from public.settings),
    'technicians', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'procedures', procedures) order by name)
                             from public.technicians where active), '[]'),
    'delay_reasons', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', label) order by label)
                               from public.delay_reasons where active and not system), '[]'),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'rego', j.rego, 'make', j.make, 'model', j.model, 'colour', j.colour, 'photo_url', j.photo_url,
        'status', j.status, 'board_colour', coalesce(s.board_colour, 'green'),
        'quoted_hours', coalesce(s.quoted_hours, 0), 'actual_hours', coalesce(s.actual_hours, 0),
        'substatus', ss.substatus, 'substatus_reason', ss.reason, 'substatus_since', ss.since,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'description', q.description, 'procedure', q.procedure, 'quoted_hours', q.quoted_hours,
            'owner_id', q.assigned_technician_id, 'state', st.state, 'actual_hours', a.actual_hours)
            order by public.procedure_order(q.procedure), q.description)
          from public.quote_lines q
          join public.v_quote_line_state st on st.quote_line_id = q.id
          join public.v_line_actuals a on a.quote_line_id = q.id
          where q.job_id = j.id), '[]')
      ) order by j.created_at)
      from public.jobs j
      left join public.v_job_summary s on s.job_id = j.id
      left join public.v_job_substatus ss on ss.job_id = j.id
      where j.status <> 'done'), '[]'),
    'running', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'line_id', w.quote_line_id, 'technician_id', w.technician_id,
                                          'role', w.role, 'started_at', w.started_at) order by w.started_at)
      from public.work_segments w where w.ended_at is null), '[]')
  );
end $$;
