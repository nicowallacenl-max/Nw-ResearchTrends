-- Autobodies "Workshop OS" screens: job details for the dashboard / job page / customer tracker,
-- a 7-stage job progress, damage records, photos and an activity log.

create type public.body_type as enum ('sedan', 'hatch', 'wagon', 'suv', 'dual_cab_ute', 'single_cab_ute', 'van', 'coupe');
create sequence public.job_number_seq start 24101;
grant usage on sequence public.job_number_seq to authenticated;

alter table public.jobs
  add column job_number    text unique default ('AB-' || nextval('public.job_number_seq')),
  add column bay           text,
  add column customer_name text,
  add column customer_phone text,
  add column insurer       text,                 -- null = private / customer-paid
  add column claim_number  text,
  add column vin           text,
  add column body_type     public.body_type not null default 'sedan',
  add column eta           date,
  add column work_summary  text,
  -- 0 Assess · 1 Approve · 2 Strip · 3 Panel · 4 Paint · 5 Reassemble · 6 QC & Ready · 7 complete (ready to collect)
  add column stage         smallint not null default 0 check (stage between 0 and 7),
  add column track_token   text not null unique default replace(gen_random_uuid()::text, '-', ''),
  add column collected_at  timestamptz;

alter table public.quote_lines add column price numeric(10,2) check (price >= 0);   -- ex GST

alter table public.settings
  add column shop_phone text,
  add column gst_rate   numeric(5,4) not null default 0.10;

create function public.stage_name(p smallint) returns text
language sql immutable set search_path = public as $$
  select (array['Assess','Approve','Strip','Panel','Paint','Reassemble','QC & Ready','Complete'])[p + 1];
$$;

-- ---------------------------------------------------------------- damage + photos
create table public.job_damage (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs (id) on delete cascade,
  panel      text not null,                      -- standard panel id, e.g. 'left_rear_quarter' (see src/lib/vehicle.ts)
  type       text not null,                      -- dent / scratch / crack / ...
  severity   text not null default 'moderate' check (severity in ('minor', 'moderate', 'severe')),
  note       text,
  created_at timestamptz not null default now()
);
create index job_damage_job_idx on public.job_damage (job_id);

create table public.job_photos (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs (id) on delete cascade,
  damage_id  uuid references public.job_damage (id) on delete set null,
  path       text not null,                      -- object path in the 'job-photos' storage bucket
  caption    text,
  created_at timestamptz not null default now()
);
create index job_photos_job_idx on public.job_photos (job_id, created_at);

-- ---------------------------------------------------------------- activity log
create table public.job_events (
  id      uuid primary key default gen_random_uuid(),
  job_id  uuid not null references public.jobs (id) on delete cascade,
  at      timestamptz not null default now(),
  kind    text not null,                         -- created / stage / note / photo / collected
  stage   smallint,                              -- for kind = 'stage': the stage reached
  message text not null,
  actor   uuid references public.app_users (id) on delete set null
);
create index job_events_job_idx on public.job_events (job_id, at);

do $$
declare t text;
begin
  foreach t in array array['job_damage','job_photos','job_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_write', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
grant select, insert, update, delete on public.job_damage, public.job_photos to authenticated;
grant select, insert on public.job_events to authenticated;

-- Log job creation and every stage change (from the office or automatic).
create function public.jobs_log_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'INSERT' then
    insert into public.job_events (job_id, at, kind, stage, message, actor) values (new.id, new.created_at, 'created', 0, 'Job created', auth.uid());
  elsif new.stage is distinct from old.stage then
    select email into who from public.app_users where id = auth.uid();
    insert into public.job_events (job_id, kind, stage, message, actor)
    values (new.id, 'stage', new.stage,
            case when new.stage = 7 then coalesce(who, 'Workshop') || ' marked the job complete · ready to collect'
                 when new.stage < old.stage then coalesce(who, 'Workshop') || ' moved job back to ' || upper(public.stage_name(new.stage))
                 else coalesce(who, 'Workshop') || ' moved job to ' || upper(public.stage_name(new.stage)) end,
            auth.uid());
  end if;
  if tg_op = 'UPDATE' and new.collected_at is not null and old.collected_at is null then
    insert into public.job_events (job_id, kind, message, actor) values (new.id, 'collected', 'Vehicle collected by customer', auth.uid());
  end if;
  return null;
end $$;
create trigger jobs_log_events_trg after insert or update on public.jobs
  for each row execute function public.jobs_log_events();

-- ---------------------------------------------------------------- automatic stage from the work done
-- Once work has started, the job sits at the first stage whose items aren't all complete
-- (Strip = strip, Panel = repair, Paint = prep + paint, Reassemble = refit; stages with no items are skipped),
-- or QC & Ready once everything is done. Never moves a job backwards and never marks it complete.
create function public.derived_stage(p_job uuid) returns smallint
language sql stable security definer set search_path = public as $$
  with g(stage_idx, procs) as (
    values (2, array['strip']::public.procedure_type[]), (3, array['repair']::public.procedure_type[]),
           (4, array['prep','paint']::public.procedure_type[]), (5, array['refit']::public.procedure_type[])
  ), st as (
    select g.stage_idx, count(q.id) as n, bool_and(q.completed_at is not null) as all_done
    from g left join public.quote_lines q on q.job_id = p_job and q.procedure = any (g.procs)
    group by g.stage_idx
  )
  select case
    when not exists (select 1 from public.work_segments w join public.quote_lines q on q.id = w.quote_line_id where q.job_id = p_job)
      then 0
    else coalesce((select min(stage_idx) from st where n > 0 and not all_done), 6)
  end::smallint;
$$;

create function public.sync_job_stage(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d smallint := public.derived_stage(p_job);
begin
  update public.jobs set stage = d where id = p_job and stage < d and stage < 7;
end $$;

create function public.sync_stage_from_segment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_job_stage((select job_id from public.quote_lines where id = new.quote_line_id));
  return null;
end $$;
create trigger work_segments_sync_stage after insert on public.work_segments
  for each row execute function public.sync_stage_from_segment();

create function public.sync_stage_from_line() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_job_stage(new.job_id);
  return null;
end $$;
create trigger quote_lines_sync_stage after update of completed_at on public.quote_lines
  for each row when (new.completed_at is not null) execute function public.sync_stage_from_line();

revoke all on function public.derived_stage(uuid), public.sync_job_stage(uuid) from public, anon, authenticated;

-- Existing jobs: a 'created' event, then catch their stage up with the work already done.
insert into public.job_events (job_id, at, kind, stage, message) select id, created_at, 'created', 0, 'Job created' from public.jobs;
do $$ declare j uuid; begin for j in select id from public.jobs loop perform public.sync_job_stage(j); end loop; end $$;

-- ---------------------------------------------------------------- activity view (job page)
create view public.v_job_activity with (security_invoker = true) as
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
         when r.system then ' switched to another job · ' || q.description
         else ' paused ' || q.description || ' · ' || coalesce(r.label, 'no reason')
       end
from public.work_segments w join public.quote_lines q on q.id = w.quote_line_id join public.technicians t on t.id = w.technician_id
left join public.delay_reasons r on r.id = w.delay_reason_id
where w.ended_at is not null;
grant select on public.v_job_activity to authenticated;

-- ---------------------------------------------------------------- customer tracker (public, by unguessable token)
-- Only what the customer needs: vehicle, progress, dates, photos, shop phone. No names, prices or claim details.
create function public.track_job(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j public.jobs;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into j from public.jobs where track_token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'job_number', j.job_number, 'make', j.make, 'model', j.model, 'rego', j.rego, 'colour', j.colour,
    'stage', j.stage, 'eta', j.eta, 'collected', j.collected_at is not null, 'created_at', j.created_at,
    -- when each stage was first reached (index 0..7; null if not yet)
    'stage_times', (select jsonb_agg((select min(e.at) from public.job_events e where e.job_id = j.id and e.kind in ('created','stage') and e.stage >= s) order by s)
                    from generate_series(0, 7) s),
    'shop_phone', (select shop_phone from public.settings),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'caption', p.caption) order by p.created_at) from public.job_photos p where p.job_id = j.id), '[]')
  );
end $$;
revoke all on function public.track_job(text) from public;
grant execute on function public.track_job(text) to anon, authenticated;
