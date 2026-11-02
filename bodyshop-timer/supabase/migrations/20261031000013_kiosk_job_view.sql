-- Wall board job view (Workshop OS): the board gets each job's number, bay, stage, body type and ETA,
-- and kiosk_job() returns one job's damage, photos and activity log for the full job screen.
-- Same door as the other kiosk functions: a paired device key is required. No prices or customer details.

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
        'job_number', j.job_number, 'bay', j.bay, 'stage', j.stage, 'body_type', j.body_type, 'eta', j.eta,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'description', q.description, 'procedure', q.procedure, 'quoted_hours', q.quoted_hours,
            'owner_id', q.assigned_technician_id, 'state', st.state, 'actual_hours', a.actual_hours)
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

create function public.kiosk_job(p_key text, p_job uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  if public.kiosk_device_id(p_key) is null then return public.kiosk_err('not_paired'); end if;
  select * into j from public.jobs where id = p_job;
  if not found then return public.kiosk_err('not_found'); end if;
  return jsonb_build_object(
    'ok', true,
    'job', jsonb_build_object('id', j.id, 'job_number', j.job_number, 'vin', j.vin, 'body_type', j.body_type, 'eta', j.eta,
                              'stage', j.stage, 'bay', j.bay, 'insurer', j.insurer),
    'damage', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'panel', d.panel, 'type', d.type, 'severity', d.severity, 'note', d.note) order by d.created_at)
                        from public.job_damage d where d.job_id = j.id), '[]'),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'caption', p.caption) order by p.created_at)
                        from public.job_photos p where p.job_id = j.id), '[]'),
    'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc)
                          from (select at, kind, message from public.v_job_activity where job_id = j.id order by at desc limit 15) a), '[]')
  );
end $$;
revoke all on function public.kiosk_job(text, uuid) from public;
grant execute on function public.kiosk_job(text, uuid) to anon, authenticated;
