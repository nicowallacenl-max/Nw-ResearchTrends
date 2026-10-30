-- Wall board (kiosk) access.
-- The tablet never signs in as a person. An admin pairs it once; it then holds a random device key
-- (httpOnly cookie) and every clock action goes through the kiosk_* functions below, which check the
-- device key AND the technician's PIN, and enforce the clock rules inside the database.

create table public.kiosk_devices (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  key_hash     text not null unique,              -- sha256 of the device key; the key itself is never stored
  created_at   timestamptz not null default now(),
  created_by   uuid references public.app_users (id),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);
alter table public.kiosk_devices enable row level security;
create policy kiosk_devices_staff_read  on public.kiosk_devices for select to authenticated using (public.is_staff());
create policy kiosk_devices_admin_write on public.kiosk_devices for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.kiosk_devices from anon, authenticated;
grant select (id, name, created_at, last_seen_at, revoked_at), update (name, revoked_at) on public.kiosk_devices to authenticated;

-- Admin pairs the current browser as a wall board. Returns the device key (shown to nobody; the app puts it in a cookie).
create function public.pair_kiosk_device(p_name text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare k text := encode(gen_random_bytes(32), 'hex');
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  insert into public.kiosk_devices (name, key_hash, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'Wall board'), encode(digest(k, 'sha256'), 'hex'), auth.uid());
  return k;
end $$;
revoke all on function public.pair_kiosk_device(text) from public, anon;
grant execute on function public.pair_kiosk_device(text) to authenticated;

-- ---------------------------------------------------------------- internal helpers (not callable via the API)
create function public.kiosk_device_id(p_key text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare d uuid;
begin
  if p_key is null or length(p_key) < 32 then return null; end if;
  update public.kiosk_devices set last_seen_at = now()
   where key_hash = encode(digest(p_key, 'sha256'), 'hex') and revoked_at is null
  returning id into d;
  return d;
end $$;

-- 'ok' | 'not_paired' | 'wrong_pin' | 'locked' | 'inactive'. Never raises, so wrong-PIN counts are kept.
create function public.kiosk_auth(p_key text, p_tech uuid, p_pin text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if public.kiosk_device_id(p_key) is null then return 'not_paired'; end if;
  return public.verify_technician_pin(p_tech, coalesce(p_pin, ''));
end $$;

create function public.line_is_locked(p_line uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.quote_lines q join public.quote_lines p on p.job_id = q.job_id
    where q.id = p_line
      and public.procedure_order(p.procedure) < public.procedure_order(q.procedure)
      and p.completed_at is null);
$$;

create function public.kiosk_err(p_code text, p_detail text default null) returns jsonb
language sql immutable as $$ select jsonb_build_object('ok', false, 'error', p_code, 'detail', p_detail); $$;

revoke all on function public.kiosk_device_id(text), public.kiosk_auth(text, uuid, text),
  public.line_is_locked(uuid), public.kiosk_err(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- board data
create function public.kiosk_board(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.kiosk_device_id(p_key) is null then return public.kiosk_err('not_paired'); end if;
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

-- ---------------------------------------------------------------- clock actions
-- Start (clock on). Owner = assigned technician; anyone else is a helper (subject to helper policy).
-- An unassigned item is owned by the first person to start it. A running segment elsewhere is auto-paused
-- with the system reason "Switched job".
create function public.kiosk_start(p_key text, p_tech uuid, p_pin text, p_line uuid,
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

-- Pause: closes the technician's running segment. A delay reason is required.
create function public.kiosk_pause(p_key text, p_tech uuid, p_pin text, p_reason uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a text; seg uuid;
begin
  a := public.kiosk_auth(p_key, p_tech, p_pin);
  if a <> 'ok' then return public.kiosk_err(a); end if;
  if not exists (select 1 from public.delay_reasons where id = p_reason and active and not system) then
    return public.kiosk_err('reason_required');
  end if;
  update public.work_segments set ended_at = now(), end_type = 'paused', delay_reason_id = p_reason
   where technician_id = p_tech and ended_at is null
  returning id into seg;
  if seg is null then return public.kiosk_err('not_running'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Complete: only the owner. Closes their running segment on the line (if any) and marks the line done.
-- Blocked while a helper is still clocked on. The job is done when all its lines are.
create function public.kiosk_complete(p_key text, p_tech uuid, p_pin text, p_line uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a text; l public.quote_lines; helpers text; job_done boolean;
begin
  a := public.kiosk_auth(p_key, p_tech, p_pin);
  if a <> 'ok' then return public.kiosk_err(a); end if;

  select * into l from public.quote_lines where id = p_line for update;
  if not found then return public.kiosk_err('not_found'); end if;
  if l.completed_at is not null then return public.kiosk_err('line_done'); end if;
  if l.assigned_technician_id is distinct from p_tech then return public.kiosk_err('not_owner'); end if;
  if public.line_is_locked(l.id) then return public.kiosk_err('line_locked'); end if;

  select string_agg(t.name, ', ') into helpers
    from public.work_segments w join public.technicians t on t.id = w.technician_id
   where w.quote_line_id = l.id and w.ended_at is null and w.technician_id <> p_tech;
  if helpers is not null then return public.kiosk_err('helpers_running', helpers); end if;

  update public.work_segments set ended_at = now(), end_type = 'completed'
   where quote_line_id = l.id and technician_id = p_tech and ended_at is null;
  update public.quote_lines set completed_at = now() where id = l.id;

  job_done := not exists (select 1 from public.quote_lines where job_id = l.job_id and completed_at is null);
  if job_done then update public.jobs set status = 'done' where id = l.job_id; end if;
  return jsonb_build_object('ok', true, 'job_done', job_done);
end $$;

-- The kiosk functions are the only door for the wall board: device key + PIN are checked inside.
revoke all on function public.kiosk_board(text), public.kiosk_start(text, uuid, text, uuid, text, text),
  public.kiosk_pause(text, uuid, text, uuid), public.kiosk_complete(text, uuid, text, uuid) from public;
grant execute on function public.kiosk_board(text), public.kiosk_start(text, uuid, text, uuid, text, text),
  public.kiosk_pause(text, uuid, text, uuid), public.kiosk_complete(text, uuid, text, uuid) to anon, authenticated;
