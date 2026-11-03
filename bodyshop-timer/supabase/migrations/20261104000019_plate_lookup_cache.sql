-- Cache of PlateAPI rego lookups. The free plan allows 20 lookups a month (misses count too), so each
-- plate+state is only ever paid for once: hits and "not found" are both stored. Admin only.
create table public.plate_lookups (
  plate        text not null check (plate ~ '^[A-Z0-9]{1,9}$'),
  state        text not null check (state in ('QLD','NSW','VIC','SA','WA','TAS','NT','ACT')),
  found        boolean not null,
  make         text,
  model        text,
  body_type    public.body_type,
  description  text,
  alternatives jsonb not null default '[]',
  looked_up_at timestamptz not null default now(),
  primary key (plate, state)
);
alter table public.plate_lookups enable row level security;
create policy plate_lookups_admin on public.plate_lookups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.plate_lookups to authenticated;

-- Type-ahead for the New job rego box: vehicles already known (past jobs first, then cached lookups),
-- matched on the start of the rego, ignoring spaces/dashes. Invoker rights, so RLS applies (admin/owner read).
create function public.rego_suggestions(p_prefix text, p_limit int default 6)
returns table (rego text, source text, make text, model text, colour text, vin text, body_type public.body_type,
               customer_name text, state text, seen_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with q as (select upper(regexp_replace(coalesce(p_prefix, ''), '[^A-Za-z0-9]', '', 'g')) as p),
  jobs_m as (
    select distinct on (n.r) n.r as rego, 'job'::text as source, j.make, j.model, j.colour, j.vin,
           j.body_type, j.customer_name, null::text as state, j.created_at as seen_at
    from public.jobs j
    cross join q
    cross join lateral (select upper(regexp_replace(j.rego, '[^A-Za-z0-9]', '', 'g')) as r) n
    where length(q.p) >= 2 and n.r like q.p || '%'
    order by n.r, j.created_at desc
  ),
  cache_m as (
    select c.plate, 'lookup'::text, c.make, c.model, null::text, null::text, c.body_type, null::text, c.state, c.looked_up_at
    from public.plate_lookups c, q
    where length(q.p) >= 2 and c.found and c.plate like q.p || '%'
      and not exists (select 1 from jobs_m where jobs_m.rego = c.plate)
  )
  select * from (select * from jobs_m union all select * from cache_m) x
  order by (x.rego = (select p from q)) desc, x.source = 'lookup', x.seen_at desc
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;
revoke all on function public.rego_suggestions(text, int) from public, anon;
grant execute on function public.rego_suggestions(text, int) to authenticated;
