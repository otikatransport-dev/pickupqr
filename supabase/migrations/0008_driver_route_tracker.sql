-- =========================================================================
-- Driver Route Tracker: each driver builds an ordered list of companies for the day,
-- enters a vehicle number per stop, and posts it. Other drivers see posted routes
-- (read-only) through posted_routes(). Run AFTER 0007.
-- =========================================================================

-- Today's date in Montreal, so "today" does not flip at 7-8 pm local time.
create or replace function public.app_today() returns date
language sql stable as $$ select (now() at time zone 'America/Toronto')::date $$;

create table public.driver_routes (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.profiles(id) on delete cascade,
  route_date  date not null default public.app_today(),
  status      text not null default 'draft' check (status in ('draft', 'submitted', 'completed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (driver_id, route_date)
);

create table public.driver_route_stops (
  id             uuid primary key default gen_random_uuid(),
  route_id       uuid not null references public.driver_routes(id) on delete cascade,
  -- restrict: a company that appears in route history cannot be deleted (archive it instead)
  company_id     uuid not null references public.companies(id) on delete restrict,
  sequence       int  not null check (sequence >= 1),
  vehicle_number text,
  status         text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  completed_at   timestamptz,
  unique (route_id, company_id)
);
create index on public.driver_route_stops (company_id);
create index on public.driver_route_stops (route_id, sequence);

alter table public.driver_routes enable row level security;
alter table public.driver_route_stops enable row level security;

-- Drivers read their own route and stops directly; every write goes through save_driver_route().
-- Super admins can read everything (oversight).
create policy "driver_routes_own_read" on public.driver_routes for select using (driver_id = auth.uid());
create policy "driver_routes_super_read" on public.driver_routes for select using (public.is_super_admin());
create policy "driver_stops_own_read" on public.driver_route_stops for select
  using (exists (select 1 from public.driver_routes r where r.id = route_id and r.driver_id = auth.uid()));
create policy "driver_stops_super_read" on public.driver_route_stops for select using (public.is_super_admin());

-- Drivers need the company list (they pick from it) even though they belong to no company.
create policy "companies_driver_read" on public.companies for select
  using (public.current_role() = 'driver' and status = 'active');

-- Save the caller's route for today: replaces the stops in the given order, atomically.
-- p_stops: [{"companyId": "...", "vehicleNumber": "...", "status": "pending|in_progress|completed"}]
create or replace function public.save_driver_route(p_stops jsonb, p_post boolean default false)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  rid uuid;
  s jsonb;
  i int := 0;
  cid uuid;
  veh text;
  st text;
  old_status text;
  all_done boolean := true;
  prev_done jsonb;
begin
  if me is null or public.current_role() <> 'driver' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) > 60 then
    raise exception 'invalid_stops' using errcode = '22023';
  end if;

  insert into driver_routes (driver_id) values (me)
    on conflict (driver_id, route_date) do update set updated_at = now()
    returning id into rid;

  -- keep what was already completed so a re-save cannot erase history
  select coalesce(jsonb_object_agg(company_id::text, completed_at), '{}'::jsonb) into prev_done
    from driver_route_stops where route_id = rid and completed_at is not null;
  delete from driver_route_stops where route_id = rid;

  for s in select * from jsonb_array_elements(p_stops) loop
    i := i + 1;
    cid := (s->>'companyId')::uuid;
    veh := nullif(btrim(coalesce(s->>'vehicleNumber', '')), '');
    st := coalesce(s->>'status', 'pending');
    if st not in ('pending', 'in_progress', 'completed') then raise exception 'invalid_status' using errcode = '22023'; end if;
    if not exists (select 1 from companies where id = cid and status = 'active') then
      raise exception 'company_unavailable' using errcode = '22023';
    end if;
    if (p_post or st <> 'pending') and veh is null then
      raise exception 'vehicle_required' using errcode = '22023';
    end if;
    if length(veh) > 30 then raise exception 'invalid_vehicle' using errcode = '22023'; end if;
    insert into driver_route_stops (route_id, company_id, sequence, vehicle_number, status, completed_at)
      values (rid, cid, i, veh, st,
        case when st = 'completed' then coalesce((prev_done->>(cid::text))::timestamptz, now()) else null end);
    if st <> 'completed' then all_done := false; end if;
  end loop;

  select status into old_status from driver_routes where id = rid;
  update driver_routes set updated_at = now(),
    status = case
      when i > 0 and all_done and (p_post or old_status <> 'draft') then 'completed'
      when p_post or old_status in ('submitted', 'completed') then 'submitted'
      else 'draft' end
  where id = rid;
  return rid;
end $$;
revoke all on function public.save_driver_route(jsonb, boolean) from public, anon;
grant execute on function public.save_driver_route(jsonb, boolean) to authenticated;

-- Posted routes for one day. Drivers see every driver's posted route; super admins see all;
-- company admins only the stops for their own company. Drafts are never shown to others.
create or replace function public.posted_routes(p_date date default public.app_today())
returns table (route_id uuid, driver_id uuid, driver_name text, route_date date, route_status text,
               stop_sequence int, company_id uuid, company_name text, company_color text,
               vehicle_number text, stop_status text)
language sql stable security definer set search_path = public
as $$
  select r.id, r.driver_id, coalesce(nullif(p.full_name, ''), 'Driver'), r.route_date, r.status,
         s.sequence, c.id, c.name, c.color, s.vehicle_number, s.status
  from driver_routes r
  join profiles p on p.id = r.driver_id
  join driver_route_stops s on s.route_id = r.id
  join companies c on c.id = s.company_id
  where r.route_date = p_date
    and r.status in ('submitted', 'completed')
    and (
      public.current_role() in ('driver', 'super_admin')
      or (public.current_role() = 'company_admin' and s.company_id = public.current_company_id())
    )
  order by p.full_name, r.id, s.sequence;
$$;
revoke all on function public.posted_routes(date) from public, anon;
grant execute on function public.posted_routes(date) to authenticated;

-- Linked records now also counts route stops.
drop function if exists public.company_linked_records();
create function public.company_linked_records()
returns table (company_id uuid, employees bigint, drivers bigint, boarding_points bigint, routes bigint, plannings bigint, route_stops bigint)
language sql stable security invoker as $$
  select c.id,
    (select count(*) from public.employees e where e.company_id = c.id),
    (select count(*) from public.drivers d where d.company_id = c.id),
    (select count(*) from public.boarding_points b where b.company_id = c.id),
    (select count(*) from public.routes r where r.company_id = c.id),
    (select count(*) from public.plannings p where p.company_id = c.id),
    (select count(*) from public.driver_route_stops t where t.company_id = c.id)
  from public.companies c;
$$;
grant execute on function public.company_linked_records() to authenticated;
