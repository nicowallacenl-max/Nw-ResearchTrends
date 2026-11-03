-- Due in / due out dates and the calendar view (wall board + office).
-- "Due out" replaces the old ETA (same column, renamed); "due in" is when the vehicle arrives.
alter table public.jobs rename column eta to due_out;
alter table public.jobs add column due_in date;

-- One job as the board/calendar sees it (lines with state, hours, substatus, dates). Security invoker: the office
-- calls it through calendar_jobs() under its own RLS; the kiosk functions call it after checking the device key.
create function public.board_job_json(j public.jobs) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', j.id, 'rego', j.rego, 'make', j.make, 'model', j.model, 'colour', j.colour, 'photo_url', j.photo_url,
    'status', j.status, 'board_colour', coalesce(s.board_colour, 'green'),
    'quoted_hours', coalesce(s.quoted_hours, 0), 'actual_hours', coalesce(s.actual_hours, 0),
    'substatus', ss.substatus, 'substatus_reason', ss.reason, 'substatus_since', ss.since,
    'job_number', j.job_number, 'bay', j.bay, 'stage', j.stage, 'body_type', j.body_type,
    'due_in', j.due_in, 'due_out', j.due_out,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'description', q.description, 'procedure', q.procedure, 'quoted_hours', q.quoted_hours,
        'owner_id', q.assigned_technician_id, 'state', st.state, 'actual_hours', a.actual_hours,
        'pause_reason', st.pause_reason, 'paused_at', st.paused_at, 'paused_by', st.paused_by)
        order by public.procedure_order(q.procedure), q.description)
      from public.quote_lines q
      join public.v_quote_line_state st on st.quote_line_id = q.id
      join public.v_line_actuals a on a.quote_line_id = q.id
      where q.job_id = j.id), '[]'))
  from (select 1) one
  left join public.v_job_summary s on s.job_id = j.id
  left join public.v_job_substatus ss on ss.job_id = j.id;
$$;

-- Calendar: jobs (not yet collected) due in or due out between two dates, plus anything overdue
-- (due out before today and not finished) so it can't hide. "today" is the shop's local date.
create function public.calendar_jobs(p_from date, p_to date) returns jsonb
language sql stable set search_path = public as $$
  with t as (select (now() at time zone (select time_zone from public.settings))::date as today)
  select jsonb_build_object(
    'today', (select today from t),
    'jobs', coalesce((
      select jsonb_agg(public.board_job_json(j) order by coalesce(j.due_out, j.due_in), j.job_number)
      from public.jobs j
      where j.collected_at is null
        and (j.due_in between p_from and p_to
             or j.due_out between p_from and p_to
             or (j.due_out < (select today from t) and j.status <> 'done'))), '[]'));
$$;
revoke all on function public.board_job_json(public.jobs), public.calendar_jobs(date, date) from public, anon;
grant execute on function public.calendar_jobs(date, date), public.board_job_json(public.jobs) to authenticated;  -- invoker: RLS applies

create function public.kiosk_calendar(p_key text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.kiosk_device_id(p_key) is null then return public.kiosk_err('not_paired'); end if;
  return public.calendar_jobs(p_from, p_to) || jsonb_build_object('ok', true);
end $$;
revoke all on function public.kiosk_calendar(text, date, date) from public;
grant execute on function public.kiosk_calendar(text, date, date) to anon, authenticated;

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
    'jobs', coalesce((select jsonb_agg(public.board_job_json(j) order by j.bay nulls last, j.created_at)
                      from public.jobs j where j.status <> 'done' and j.collected_at is null), '[]'),
    'running', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'line_id', w.quote_line_id, 'technician_id', w.technician_id,
                                          'role', w.role, 'started_at', w.started_at) order by w.started_at)
      from public.work_segments w where w.ended_at is null), '[]')
  );
end $$;

create or replace function public.kiosk_job(p_key text, p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  if public.kiosk_device_id(p_key) is null then return public.kiosk_err('not_paired'); end if;
  select * into j from public.jobs where id = p_job;
  if not found then return public.kiosk_err('not_found'); end if;
  return jsonb_build_object(
    'ok', true,
    'job', jsonb_build_object('id', j.id, 'job_number', j.job_number, 'vin', j.vin, 'body_type', j.body_type, 'due_in', j.due_in, 'due_out', j.due_out,
                              'stage', j.stage, 'bay', j.bay, 'insurer', j.insurer),
    'damage', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'panel', d.panel, 'type', d.type, 'severity', d.severity, 'note', d.note) order by d.created_at)
                        from public.job_damage d where d.job_id = j.id), '[]'),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'caption', p.caption) order by p.created_at)
                        from public.job_photos p where p.job_id = j.id), '[]'),
    'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc)
                          from (select at, kind, message from public.v_job_activity where job_id = j.id order by at desc limit 15) a), '[]')
  );
end $$;

create or replace function public.track_job(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j public.jobs;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into j from public.jobs where track_token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'job_number', j.job_number, 'make', j.make, 'model', j.model, 'rego', j.rego, 'colour', j.colour,
    'stage', j.stage, 'due_out', j.due_out, 'collected', j.collected_at is not null, 'created_at', j.created_at,
    -- when each stage was first reached (index 0..7; null if not yet)
    'stage_times', (select jsonb_agg((select min(e.at) from public.job_events e where e.job_id = j.id and e.kind in ('created','stage') and e.stage >= s) order by s)
                    from generate_series(0, 7) s),
    'shop_phone', (select shop_phone from public.settings),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'caption', p.caption) order by p.created_at) from public.job_photos p where p.job_id = j.id), '[]')
  );
end $$;
