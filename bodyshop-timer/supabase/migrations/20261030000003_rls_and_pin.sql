-- Access model:
--   * admin  (front office): full read/write on everything.
--   * owner  (shop owner):   read-only on everything except PIN data.
--   * kiosk (wall tablet):   NO direct database access. A Next.js server route using the
--                            service_role key verifies the PIN and performs clock actions.
-- anon gets nothing. service_role bypasses RLS by design (server routes only; never ship to browser).

create function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.app_users where id = auth.uid();
$$;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;
create function public.is_staff() returns boolean   -- admin or owner
language sql stable security definer set search_path = public as $$
  select public.current_app_role() is not null;
$$;

alter table public.app_users     enable row level security;
alter table public.technicians   enable row level security;
alter table public.delay_reasons enable row level security;
alter table public.jobs          enable row level security;
alter table public.quote_lines   enable row level security;
alter table public.work_segments enable row level security;
alter table public.settings      enable row level security;

-- Read for admin + owner; write for admin only.
do $$
declare t text;
begin
  foreach t in array array['technicians','delay_reasons','jobs','quote_lines','work_segments','settings'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_write', t);
  end loop;
end $$;

create policy app_users_self_read  on public.app_users for select to authenticated using (id = auth.uid() or public.is_admin());
create policy app_users_admin_write on public.app_users for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Table privileges: start closed, then open exactly what's needed.
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on public.app_users, public.delay_reasons, public.jobs,
  public.quote_lines, public.settings to authenticated;
grant select, insert, update on public.work_segments to authenticated;     -- no delete (also trigger-blocked)

-- technicians: PIN columns are never exposed to any browser session.
grant select (id, name, hourly_cost_rate, procedures, active, locked_until) on public.technicians to authenticated;
grant update (name, hourly_cost_rate, procedures, active) on public.technicians to authenticated;
grant delete on public.technicians to authenticated;

grant select on public.v_segment_hours, public.v_line_actuals, public.v_quote_line_state,
  public.v_job_summary, public.v_technician_summary, public.v_procedure_summary,
  public.v_delay_losses, public.v_delay_by_reason, public.v_helper_report,
  public.v_technician_open_hours, public.v_review_queue to authenticated;

-- ---------------------------------------------------------------- PIN functions
-- Admin sets/changes a PIN; only the bcrypt hash is stored.
create function public.set_technician_pin(p_technician uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
  update public.technicians
     set pin_hash = crypt(p_pin, gen_salt('bf')), failed_pin_count = 0, locked_until = null
   where id = p_technician;
end $$;

-- Kiosk server route calls this (service_role only). Returns 'ok' | 'wrong_pin' | 'locked' | 'inactive'.
-- 5 wrong PINs locks the technician for 5 minutes (values come from settings).
create function public.verify_technician_pin(p_technician uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  t public.technicians;
  s public.settings;
begin
  select * into s from public.settings;
  select * into t from public.technicians where id = p_technician for update;
  if not found or not t.active then return 'inactive'; end if;
  if t.locked_until is not null and t.locked_until > now() then return 'locked'; end if;

  if t.pin_hash = crypt(p_pin, t.pin_hash) then
    update public.technicians set failed_pin_count = 0, locked_until = null where id = t.id;
    return 'ok';
  end if;

  if t.failed_pin_count + 1 >= s.pin_max_attempts then
    update public.technicians
       set failed_pin_count = 0, locked_until = now() + make_interval(mins => s.pin_lock_minutes)
     where id = t.id;
    return 'locked';
  end if;
  update public.technicians set failed_pin_count = failed_pin_count + 1 where id = t.id;
  return 'wrong_pin';
end $$;

revoke all on function public.verify_technician_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_technician_pin(uuid, text) to service_role;
revoke all on function public.set_technician_pin(uuid, text) from public, anon;
grant execute on function public.set_technician_pin(uuid, text) to authenticated;

-- Admin creates a technician with a PIN in one step (pin_hash is not insertable directly).
create function public.create_technician(p_name text, p_rate numeric, p_procedures public.procedure_type[], p_pin text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
  insert into public.technicians (name, hourly_cost_rate, procedures, pin_hash)
  values (p_name, p_rate, p_procedures, crypt(p_pin, gen_salt('bf')))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.create_technician(text, numeric, public.procedure_type[], text) from public, anon;
grant execute on function public.create_technician(text, numeric, public.procedure_type[], text) to authenticated;
