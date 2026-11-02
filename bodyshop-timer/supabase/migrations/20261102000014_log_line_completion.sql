-- Activity log: completing an item while not clocked on (e.g. after a pause) left no log line, because only
-- finished timers were logged. kiosk_complete now writes "<tech> completed <item>" when no timer was closed.
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
