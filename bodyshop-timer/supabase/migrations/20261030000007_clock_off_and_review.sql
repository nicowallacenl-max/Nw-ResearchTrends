-- Session 4: automatic knock-off clock-off and the admin review of flagged segments.

-- Close every running segment whose knock-off moment has passed, as 'auto_closed' (the audit trigger
-- flags it for review). The end time is the knock-off time on the day it started, not "now", so a
-- forgotten timer doesn't bill the whole night. A segment started after knock-off (overtime) is closed
-- at the end of that day instead. Returns how many were closed.
create function public.auto_clock_off() returns int
language plpgsql security definer set search_path = public as $$
declare s public.settings; n int;
begin
  select * into s from public.settings;
  with cut as (
    select w.id,
           case when (w.started_at at time zone s.time_zone)::time < s.knock_off_time
                then ((w.started_at at time zone s.time_zone)::date + s.knock_off_time) at time zone s.time_zone
                else ((w.started_at at time zone s.time_zone)::date + time '23:59:59') at time zone s.time_zone
           end as cutoff
    from public.work_segments w
    where w.ended_at is null
  )
  update public.work_segments w
     set ended_at = c.cutoff, end_type = 'auto_closed'
    from cut c
   where c.id = w.id and c.cutoff <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.auto_clock_off() from public, anon, authenticated;

-- The wall board also runs the clock-off whenever it refreshes, so it still happens if the scheduler is down.
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
      from public.jobs j left join public.v_job_summary s on s.job_id = j.id
      where j.status <> 'done'), '[]'),
    'running', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'line_id', w.quote_line_id, 'technician_id', w.technician_id,
                                          'role', w.role, 'started_at', w.started_at) order by w.started_at)
      from public.work_segments w where w.ended_at is null), '[]')
  );
end $$;

-- Admin approves a flagged segment, optionally correcting its times. Times are given as shop-local
-- wall-clock values (what the admin sees); null keeps the current value. The audit trigger keeps the
-- original times the first time they change. Runs as the caller, so RLS (admin write) applies too.
create function public.review_segment(p_id uuid, p_started_local timestamp default null, p_ended_local timestamp default null)
returns void language plpgsql security invoker set search_path = public as $$
declare tz text; new_start timestamptz; new_end timestamptz; w public.work_segments;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select time_zone into tz from public.settings;
  select * into w from public.work_segments where id = p_id for update;
  if not found then raise exception 'Segment not found'; end if;
  if w.ended_at is null then raise exception 'This timer is still running'; end if;

  new_start := coalesce(p_started_local at time zone tz, w.started_at);
  new_end   := coalesce(p_ended_local at time zone tz, w.ended_at);
  if new_end <= new_start then raise exception 'The end time must be after the start time'; end if;
  if new_end > now() then raise exception 'The end time can''t be in the future'; end if;

  update public.work_segments
     set started_at  = new_start,
         ended_at    = new_end,
         edited_by   = case when new_start <> w.started_at or new_end <> w.ended_at then auth.uid() else edited_by end,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_id;
end $$;
revoke all on function public.review_segment(uuid, timestamp, timestamp) from public, anon;
grant execute on function public.review_segment(uuid, timestamp, timestamp) to authenticated;
