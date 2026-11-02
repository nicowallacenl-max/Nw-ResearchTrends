-- Paused job lines: a line whose latest timer was paused with a real delay reason (and nobody is on it now)
-- is "paused" until someone resumes it. Shown on the wall board (amber bar + RESUME) and the office job page,
-- and a paused line can't be completed until it's resumed.
create or replace view public.v_quote_line_state with (security_invoker = true) as
select s.quote_line_id, s.job_id, s.procedure, s.assigned_technician_id, s.state,
       case when s.state = 'paused' then s.last_reason end as pause_reason,
       case when s.state = 'paused' then s.last_ended end as paused_at,
       case when s.state = 'paused' then s.last_tech end as paused_by
from (
  select
    q.id as quote_line_id, q.job_id, q.procedure, q.assigned_technician_id,
    case
      when q.completed_at is not null then 'done'
      when exists (
        select 1 from public.quote_lines p
        where p.job_id = q.job_id
          and public.procedure_order(p.procedure) < public.procedure_order(q.procedure)
          and p.completed_at is null
      ) then 'locked'
      when exists (select 1 from public.work_segments w where w.quote_line_id = q.id and w.ended_at is null) then 'running'
      when coalesce(lp.is_pause, false) then 'paused'
      else 'ready'
    end as state,
    lp.reason as last_reason, lp.ended_at as last_ended, lp.tech as last_tech
  from public.quote_lines q
  left join lateral (
    select w.end_type = 'paused' and not coalesce(r.system, false) as is_pause, r.label as reason, w.ended_at, t.name as tech
    from public.work_segments w
    join public.technicians t on t.id = w.technician_id
    left join public.delay_reasons r on r.id = w.delay_reason_id
    where w.quote_line_id = q.id and w.ended_at is not null
    order by w.ended_at desc limit 1
  ) lp on true
) s;

create or replace function public.kiosk_board(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.kiosk_device_id(p_key) is null then return public.kiosk_err('not_paired'); end if;
  perform public.auto_clock_off();
  return jsonb_build_object(
    'ok', true,
    'now', now(),
    'settings', (select jsonb_build_object('helper_policy', helper_policy, 'warn_pct', warn_pct, 'time_zone', time_zone, 'show_timers', board_show_timers) from public.settings),
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
        'job_number', j.job_number, 'bay', j.bay, 'stage', j.stage, 'body_type', j.body_type, 'eta', j.eta,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'description', q.description, 'procedure', q.procedure, 'quoted_hours', q.quoted_hours,
            'owner_id', q.assigned_technician_id, 'state', st.state, 'actual_hours', a.actual_hours,
            'pause_reason', st.pause_reason, 'paused_at', st.paused_at, 'paused_by', st.paused_by)
            order by public.procedure_order(q.procedure), q.description)
          from public.quote_lines q
          join public.v_quote_line_state st on st.quote_line_id = q.id
          join public.v_line_actuals a on a.quote_line_id = q.id
          where q.job_id = j.id), '[]')
      ) order by j.bay nulls last, j.created_at)
      from public.jobs j
      left join public.v_job_summary s on s.job_id = j.id
      left join public.v_job_substatus ss on ss.job_id = j.id
      where j.status <> 'done' and j.collected_at is null), '[]'),
    'running', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'line_id', w.quote_line_id, 'technician_id', w.technician_id,
                                          'role', w.role, 'started_at', w.started_at) order by w.started_at)
      from public.work_segments w where w.ended_at is null), '[]')
  );
end $$;

create or replace function public.kiosk_complete(p_key text, p_tech uuid, p_pin text, p_line uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a text; l public.quote_lines; helpers text; job_done boolean; closed int;
begin
  a := public.kiosk_auth(p_key, p_tech, p_pin);
  if a <> 'ok' then return public.kiosk_err(a); end if;

  select * into l from public.quote_lines where id = p_line for update;
  if not found then return public.kiosk_err('not_found'); end if;
  if l.completed_at is not null then return public.kiosk_err('line_done'); end if;
  if l.assigned_technician_id is distinct from p_tech then return public.kiosk_err('not_owner'); end if;
  if public.line_is_locked(l.id) then return public.kiosk_err('line_locked'); end if;
  -- A paused item has to be resumed (the delay sorted) before it can be completed.
  if (select state from public.v_quote_line_state where quote_line_id = l.id) = 'paused' then
    return public.kiosk_err('line_paused');
  end if;

  select string_agg(t.name, ', ') into helpers
    from public.work_segments w join public.technicians t on t.id = w.technician_id
   where w.quote_line_id = l.id and w.ended_at is null and w.technician_id <> p_tech;
  if helpers is not null then return public.kiosk_err('helpers_running', helpers); end if;

  update public.work_segments set ended_at = now(), end_type = 'completed'
   where quote_line_id = l.id and technician_id = p_tech and ended_at is null;
  get diagnostics closed = row_count;
  if closed = 0 then
    insert into public.job_events (job_id, kind, message)
    values (l.job_id, 'line_done', (select name from public.technicians where id = p_tech) || ' completed ' || l.description);
  end if;
  update public.quote_lines set completed_at = now() where id = l.id;

  job_done := not exists (select 1 from public.quote_lines where job_id = l.job_id and completed_at is null);
  if job_done then update public.jobs set status = 'done' where id = l.job_id; end if;
  return jsonb_build_object('ok', true, 'job_done', job_done);
end $$;
