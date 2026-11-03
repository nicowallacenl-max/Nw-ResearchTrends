-- Job lifecycle = Status (Active / Inactive) + Status reason (Review -> Approved -> Completed -> Picked up).
--   review     set on create. Not on the wall board; techs can't clock on.
--   approved   set by the office. On the wall board when due in today or earlier (or already being worked on).
--   completed  automatic when every job line is complete; back to approved if a line is reopened.
--   picked_up  set by the office. Status becomes Inactive (collected_at is stamped).
-- Repair progress stays the job lines (what the floor sees), so the old 7-step "stage" is removed.

create type public.job_status_reason as enum ('review', 'approved', 'completed', 'picked_up');
alter table public.jobs add column status_reason public.job_status_reason not null default 'review';

-- Existing jobs: picked up if collected, completed if all work done, approved if work has started, else review.
update public.jobs j set status_reason = case
  when j.collected_at is not null then 'picked_up'
  when j.status = 'done' then 'completed'
  when exists (select 1 from public.work_segments w join public.quote_lines q on q.id = w.quote_line_id where q.job_id = j.id) then 'approved'
  else 'review' end::public.job_status_reason;

-- ---------------------------------------------------------------- retire the 7-step stage
-- Nothing reads jobs.stage any more. The stage triggers become no-ops (kept, not dropped, so this
-- migration only adds/replaces; the unused column and helpers can be dropped in a later clean-up).
create or replace function public.sync_stage_from_segment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  return null;
end $$;

-- Keep status_reason, the internal work status and collected_at consistent, whoever changes what.
create function public.jobs_sync_status_reason() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- last line completed / a line reopened (kiosk_complete and reopen only touch jobs.status)
    if new.status = 'done' and old.status <> 'done' and new.status_reason = 'approved' then new.status_reason := 'completed'; end if;
    if new.status <> 'done' and old.status = 'done' and new.status_reason = 'completed' then new.status_reason := 'approved'; end if;
  end if;
  if new.status_reason = 'picked_up' then
    new.collected_at := coalesce(new.collected_at, now());
  else
    new.collected_at := null;
  end if;
  return new;
end $$;
create trigger jobs_sync_status_reason before insert or update on public.jobs
  for each row execute function public.jobs_sync_status_reason();

create or replace function public.status_reason_label(r public.job_status_reason) returns text
language sql immutable set search_path = public as $$
  select case r when 'review' then 'Review' when 'approved' then 'Approved' when 'completed' then 'Completed' else 'Picked up' end;
$$;

-- Activity log: job created + every status reason change (replaces the stage messages).
create or replace function public.jobs_log_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'INSERT' then
    insert into public.job_events (job_id, at, kind, message, actor) values (new.id, new.created_at, 'created', 'Job created · status REVIEW', auth.uid());
  elsif new.status_reason is distinct from old.status_reason then
    select email into who from public.app_users where id = auth.uid();
    insert into public.job_events (job_id, kind, message, actor)
    values (new.id, 'status',
            case when new.status_reason = 'completed' and old.status_reason = 'approved' and who is null then 'All job lines complete · status COMPLETED'
                 when new.status_reason = 'approved' and old.status_reason = 'completed' and who is null then 'A job line was reopened · status APPROVED'
                 when new.status_reason = 'picked_up' then coalesce(who, 'Workshop') || ' marked the vehicle PICKED UP · job inactive'
                 else coalesce(who, 'Workshop') || ' set status to ' || upper(public.status_reason_label(new.status_reason)) end,
            auth.uid());
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- board / kiosk / tracker payloads
create or replace function public.board_job_json(j public.jobs) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', j.id, 'rego', j.rego, 'make', j.make, 'model', j.model, 'colour', j.colour, 'photo_url', j.photo_url,
    'status', j.status, 'status_reason', j.status_reason, 'board_colour', coalesce(s.board_colour, 'green'),
    'quoted_hours', coalesce(s.quoted_hours, 0), 'actual_hours', coalesce(s.actual_hours, 0),
    'substatus', ss.substatus, 'substatus_reason', ss.reason, 'substatus_since', ss.since,
    'job_number', j.job_number, 'bay', j.bay, 'body_type', j.body_type,
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

-- Wall board: approved jobs due in today or earlier (no due-in date counts as "now"),
-- plus any approved job someone is already clocked on to.
create or replace function public.kiosk_board(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare today date;
begin
  if public.kiosk_device_id(p_key) is null then return public.kiosk_err('not_paired'); end if;
  perform public.auto_clock_off();
  today := (now() at time zone (select time_zone from public.settings))::date;
  return jsonb_build_object(
    'ok', true,
    'now', now(),
    'settings', (select jsonb_build_object('helper_policy', helper_policy, 'warn_pct', warn_pct, 'time_zone', time_zone, 'show_timers', board_show_timers) from public.settings),
    'technicians', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'procedures', procedures) order by name)
                             from public.technicians where active), '[]'),
    'delay_reasons', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', label) order by label)
                               from public.delay_reasons where active and not system), '[]'),
    'jobs', coalesce((select jsonb_agg(public.board_job_json(j) order by j.bay nulls last, j.created_at)
                      from public.jobs j
                      where j.status_reason = 'approved'
                        and (j.due_in is null or j.due_in <= today
                             or exists (select 1 from public.work_segments w join public.quote_lines q on q.id = w.quote_line_id
                                        where q.job_id = j.id and w.ended_at is null))), '[]'),
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
                              'status_reason', j.status_reason, 'bay', j.bay, 'insurer', j.insurer),
    'damage', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'panel', d.panel, 'type', d.type, 'severity', d.severity, 'note', d.note) order by d.created_at)
                        from public.job_damage d where d.job_id = j.id), '[]'),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'caption', p.caption) order by p.created_at)
                        from public.job_photos p where p.job_id = j.id), '[]'),
    'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.at desc)
                          from (select at, kind, message from public.v_job_activity where job_id = j.id order by at desc limit 15) a), '[]')
  );
end $$;

-- Customer tracker: checked in -> approved -> one step per job line -> ready to collect (same progress the floor sees).
create or replace function public.track_job(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j public.jobs;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into j from public.jobs where track_token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'job_number', j.job_number, 'make', j.make, 'model', j.model, 'rego', j.rego, 'colour', j.colour,
    'status_reason', j.status_reason, 'due_out', j.due_out, 'collected', j.collected_at is not null, 'created_at', j.created_at,
    'approved_at', (select min(e.at) from public.job_events e where e.job_id = j.id and e.kind = 'status' and e.message like '%APPROVED%'),
    'completed_at', (select max(e.at) from public.job_events e where e.job_id = j.id and e.kind = 'status' and e.message like '%COMPLETED%'),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('procedure', q.procedure, 'state', st.state, 'done_at', q.completed_at)
                                         order by public.procedure_order(q.procedure), q.description)
                       from public.quote_lines q join public.v_quote_line_state st on st.quote_line_id = q.id
                       where q.job_id = j.id), '[]'),
    'shop_phone', (select shop_phone from public.settings),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'caption', p.caption) order by p.created_at) from public.job_photos p where p.job_id = j.id), '[]')
  );
end $$;

-- ---------------------------------------------------------------- techs can only clock on to approved jobs
create or replace function public.kiosk_start(p_key text, p_tech uuid, p_pin text, p_line uuid,
                                              p_helper_reason text default null, p_approver_pin text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a text; l public.quote_lines; j public.jobs; s public.settings; cur public.work_segments;
  r public.segment_role; approval text; switched text;
begin
  a := public.kiosk_auth(p_key, p_tech, p_pin);
  if a <> 'ok' then return public.kiosk_err(a); end if;

  select * into l from public.quote_lines where id = p_line for update;
  if not found then return public.kiosk_err('not_found'); end if;
  select * into j from public.jobs where id = l.job_id;
  if l.completed_at is not null or j.status = 'done' then return public.kiosk_err('line_done'); end if;
  if j.status_reason <> 'approved' then return public.kiosk_err('job_not_approved'); end if;
  if public.line_is_locked(l.id) then return public.kiosk_err('line_locked'); end if;
  select * into s from public.settings;

  if l.assigned_technician_id is null then
    update public.quote_lines set assigned_technician_id = p_tech where id = l.id;
    r := 'owner';
  elsif l.assigned_technician_id = p_tech then
    r := 'owner';
  else
    r := 'helper';
    if s.helper_policy = 'not_allowed' then return public.kiosk_err('helpers_not_allowed'); end if;
    if coalesce(btrim(p_helper_reason), '') = '' then return public.kiosk_err('helper_reason_required'); end if;
    if s.helper_policy = 'owner_approval' then
      if p_approver_pin is null then return public.kiosk_err('owner_approval_required'); end if;
      approval := public.verify_technician_pin(l.assigned_technician_id, p_approver_pin);
      if approval <> 'ok' then return public.kiosk_err('owner_' || approval); end if;
    end if;
  end if;

  select * into cur from public.work_segments where technician_id = p_tech and ended_at is null for update;
  if found then
    if cur.quote_line_id = l.id then return public.kiosk_err('already_running'); end if;
    update public.work_segments
       set ended_at = now(), end_type = 'paused',
           delay_reason_id = (select id from public.delay_reasons where system and label = 'Switched job' limit 1)
     where id = cur.id;
    select q.description into switched from public.quote_lines q where q.id = cur.quote_line_id;
  end if;

  insert into public.work_segments (quote_line_id, technician_id, role, helper_reason)
  values (l.id, p_tech, r, case when r = 'helper' then btrim(p_helper_reason) end);
  update public.jobs set status = 'in_progress' where id = j.id and status = 'open';

  return jsonb_build_object('ok', true, 'role', r, 'switched_from', switched);
end $$;
