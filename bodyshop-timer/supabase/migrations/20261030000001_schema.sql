-- Bodyshop Job Timer: core schema.
-- All timestamps are timestamptz (stored UTC); the app displays them in the shop time zone.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.procedure_type as enum ('strip', 'repair', 'prep', 'paint', 'refit');
create type public.job_status     as enum ('open', 'in_progress', 'done');
create type public.segment_end    as enum ('paused', 'completed', 'auto_closed');
create type public.segment_role   as enum ('owner', 'helper');
create type public.app_role       as enum ('admin', 'owner');
create type public.helper_policy  as enum ('allowed', 'owner_approval', 'not_allowed');

-- Procedure order drives the unlock chain (Strip -> Repair -> Prep -> Paint -> Refit).
create function public.procedure_order(p public.procedure_type)
returns int language sql immutable as $$
  select array_position(enum_range(null::public.procedure_type), p);
$$;

-- ---------------------------------------------------------------- app_users
-- Front office (admin) and owner logins. id matches auth.users.id.
create table public.app_users (
  id    uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role  public.app_role not null
);

-- ---------------------------------------------------------------- technicians
create table public.technicians (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  pin_hash         text not null,                       -- bcrypt via crypt(); never the plain PIN
  hourly_cost_rate numeric(8,2) not null check (hourly_cost_rate >= 0),
  procedures       public.procedure_type[] not null default '{}',
  active           boolean not null default true,
  failed_pin_count int not null default 0,              -- 5 wrong PINs => locked_until = now()+5min
  locked_until     timestamptz
);

-- ---------------------------------------------------------------- delay_reasons
create table public.delay_reasons (
  id     uuid primary key default gen_random_uuid(),
  label  text not null unique,
  active boolean not null default true,
  system boolean not null default false                 -- app-generated reasons (e.g. "Switched job")
);

-- ---------------------------------------------------------------- jobs
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  ibodyshop_ref text unique,
  rego          text not null,
  make          text,
  model         text,
  colour        text,
  photo_url     text,
  status        public.job_status not null default 'open',
  created_at    timestamptz not null default now()
);
create index jobs_status_idx on public.jobs (status);

-- ---------------------------------------------------------------- quote_lines
-- The unit that gets clocked against. assigned_technician_id is the procedure OWNER;
-- only the owner may complete the line. A line is "locked" while any earlier procedure
-- in the same job is incomplete (see v_quote_line_state).
create table public.quote_lines (
  id                     uuid primary key default gen_random_uuid(),
  job_id                 uuid not null references public.jobs (id) on delete cascade,
  description            text not null,
  procedure              public.procedure_type not null,
  quoted_hours           numeric(6,2) not null check (quoted_hours >= 0),
  assigned_technician_id uuid references public.technicians (id),
  completed_at           timestamptz,                   -- set on Complete; cleared if admin reopens
  created_at             timestamptz not null default now()
);
create index quote_lines_job_idx  on public.quote_lines (job_id);
create index quote_lines_tech_idx on public.quote_lines (assigned_technician_id);

-- ---------------------------------------------------------------- work_segments
-- One row per start -> stop. Never deleted. A running segment has ended_at/end_type null.
create table public.work_segments (
  id               uuid primary key default gen_random_uuid(),
  quote_line_id    uuid not null references public.quote_lines (id),
  technician_id    uuid not null references public.technicians (id),
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  end_type         public.segment_end,
  delay_reason_id  uuid references public.delay_reasons (id),
  role             public.segment_role not null default 'owner',
  helper_reason    text,                                -- why a helper joined (two-person job, behind schedule, owner absent, training)

  -- review / audit
  needs_review     boolean not null default false,      -- set for auto_closed or flagged segments
  reviewed_at      timestamptz,
  reviewed_by      uuid references public.app_users (id),
  original_started_at timestamptz,                      -- set once, on first admin correction
  original_ended_at   timestamptz,
  edited_at        timestamptz,
  edited_by        uuid references public.app_users (id),

  constraint segment_end_consistent check ((ended_at is null) = (end_type is null)),
  constraint segment_time_order     check (ended_at is null or ended_at >= started_at),
  constraint pause_needs_reason     check (end_type is distinct from 'paused' or delay_reason_id is not null),
  constraint helper_needs_reason    check (role <> 'helper' or helper_reason is not null),
  constraint helper_cannot_complete check (not (role = 'helper' and end_type = 'completed'))
);
create index work_segments_line_idx on public.work_segments (quote_line_id);
create index work_segments_tech_idx on public.work_segments (technician_id, started_at);
create index work_segments_review_idx on public.work_segments (needs_review) where needs_review and reviewed_at is null;

-- Rule: a technician can have only ONE running segment (enforced by the database itself).
create unique index one_running_segment_per_tech
  on public.work_segments (technician_id) where ended_at is null;

-- ---------------------------------------------------------------- settings (single row)
-- Not one of the spec's six tables: holds the configurable knock-off time, helper policy and
-- time zone so they live in the database rather than in code.
create table public.settings (
  id              boolean primary key default true check (id),   -- forces a single row
  knock_off_time  time not null default '17:30',
  time_zone       text not null default 'Australia/Brisbane',
  helper_policy   public.helper_policy not null default 'allowed',
  pin_max_attempts int not null default 5,
  pin_lock_minutes int not null default 5,
  warn_pct        int not null default 80                        -- tile turns amber at this % of quoted hours
);
insert into public.settings default values;

-- ---------------------------------------------------------------- integrity triggers
-- Segments are never deleted.
create function public.block_segment_delete() returns trigger language plpgsql as $$
begin
  raise exception 'work_segments rows are never deleted; correct them instead';
end $$;
create trigger work_segments_no_delete before delete on public.work_segments
  for each row execute function public.block_segment_delete();

-- Admin corrections keep the original times; flag auto-closed segments for review.
create function public.work_segments_audit() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  -- Identity of a segment can't change.
  if new.quote_line_id <> old.quote_line_id or new.technician_id <> old.technician_id then
    raise exception 'quote_line_id / technician_id on a segment cannot be changed';
  end if;

  -- Time correction on an already-closed segment: remember the originals once.
  if old.ended_at is not null
     and (new.started_at is distinct from old.started_at or new.ended_at is distinct from old.ended_at) then
    new.original_started_at := coalesce(old.original_started_at, old.started_at);
    new.original_ended_at   := coalesce(old.original_ended_at,   old.ended_at);
    new.edited_at           := now();
  end if;

  if new.end_type = 'auto_closed' and old.end_type is distinct from 'auto_closed' then
    new.needs_review := true;
  end if;
  return new;
end $$;
create trigger work_segments_audit_trg before insert or update on public.work_segments
  for each row execute function public.work_segments_audit();

-- Originals can never be overwritten once recorded.
create function public.work_segments_protect_originals() returns trigger language plpgsql as $$
begin
  if old.original_started_at is not null and new.original_started_at is distinct from old.original_started_at
     or old.original_ended_at is not null and new.original_ended_at is distinct from old.original_ended_at then
    raise exception 'original segment times are immutable';
  end if;
  return new;
end $$;
create trigger work_segments_protect_originals_trg before update on public.work_segments
  for each row execute function public.work_segments_protect_originals();
