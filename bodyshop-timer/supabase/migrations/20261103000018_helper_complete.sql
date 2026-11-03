-- Helpers get a COMPLETE button on the board. A helper can't complete the owner's item (the owner signs it off),
-- so a helper's "complete" means "I've finished helping": their timer stops with the system reason
-- "Finished helping" (not a delay: system reasons are excluded from delay reports and from the paused state),
-- the activity log says "<name> finished helping on <item>", and the owner can then complete the item.
insert into public.delay_reasons (id, label, system)
values ('00000000-0000-0000-0000-0000000000a8', 'Finished helping', true)
on conflict (label) do update set system = true, active = true;

create or replace view public.v_job_activity with (security_invoker = true) as
select e.job_id, e.at, e.kind, e.message
from public.job_events e
union all
select q.job_id, w.started_at, 'clock_on',
       t.name || case when w.role = 'helper' then ' started helping on ' else ' started ' end || q.description
from public.work_segments w join public.quote_lines q on q.id = w.quote_line_id join public.technicians t on t.id = w.technician_id
union all
select q.job_id, w.ended_at, 'clock_off',
       t.name || case
         when w.end_type = 'completed' then ' completed ' || q.description
         when w.end_type = 'auto_closed' then ' was clocked off at knock-off · ' || q.description
         when r.system and r.label = 'Finished helping' then ' finished helping on ' || q.description
         when r.system then ' switched to another job · ' || q.description
         else ' paused ' || q.description || ' · ' || coalesce(r.label, 'no reason')
       end
from public.work_segments w join public.quote_lines q on q.id = w.quote_line_id join public.technicians t on t.id = w.technician_id
left join public.delay_reasons r on r.id = w.delay_reason_id
where w.ended_at is not null;

create or replace function public.kiosk_complete(p_key text, p_tech uuid, p_pin text, p_line uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a text; l public.quote_lines; helpers text; job_done boolean; closed int;
begin
  a := public.kiosk_auth(p_key, p_tech, p_pin);
  if a <> 'ok' then return public.kiosk_err(a); end if;

  select * into l from public.quote_lines where id = p_line for update;
  if not found then return public.kiosk_err('not_found'); end if;
  if l.completed_at is not null then return public.kiosk_err('line_done'); end if;
  if l.assigned_technician_id is distinct from p_tech then
    -- A helper finishing their part: stop their timer, leave the item for the owner to complete.
    update public.work_segments
       set ended_at = now(), end_type = 'paused',
           delay_reason_id = (select id from public.delay_reasons where system and label = 'Finished helping' limit 1)
     where quote_line_id = l.id and technician_id = p_tech and ended_at is null;
    if found then return jsonb_build_object('ok', true, 'helper_done', true, 'job_done', false); end if;
    return public.kiosk_err('not_owner');
  end if;
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

