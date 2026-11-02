-- =========================================================================
-- Roles, step 2 of 2. Run AFTER 0009_roles_enum.sql.
--
-- Role ladder:  super_admin > manager > admin_hr > recruiter > driver
--   super_admin  everything, including creating other super admins
--   manager      everything else (users, roles, all data) but cannot touch super admins
--   admin_hr     companies (edit), employees (edit), planning, attendance (edit)
--   recruiter    companies (view), employees (view), planning, QR scan
--   driver       own route, own planning, posted routes, own attendance
-- Existing "company_admin" accounts become "manager" (managers have access to every company).
-- Deactivated accounts keep their history but have no role, so Row Level Security denies them everything.
-- =========================================================================

alter table public.profiles add column if not exists active boolean not null default true;

-- An inactive account has no role at all.
create or replace function public.current_role() returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active $$;

-- "is_super_admin()" is used by every existing policy. It now means the admin tier: super admin OR manager.
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() in ('super_admin', 'manager'), false) $$;

-- Strictly the super admin (used where a manager must not be able to act).
create or replace function public.is_top_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() = 'super_admin', false) $$;

-- Existing company admins become managers.
update public.profiles set role = 'manager' where role = 'company_admin';

-- A user can never change their own role, company or active flag; only the admin tier can change others'.
create or replace function public.profiles_protect_role() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    new.role := old.role;
    new.company_id := old.company_id;
    new.active := old.active;
  end if;
  -- Only a super admin may create, change or demote a super admin (a manager cannot, not even for themselves).
  if auth.uid() is not null and not public.is_top_admin()
     and (new.role = 'super_admin' or old.role = 'super_admin')
     and new.role is distinct from old.role then
    raise exception 'forbidden: only a super admin can change super admin roles' using errcode = '42501';
  end if;
  return new;
end $$;

-- profiles: the super admin manages everyone. A manager manages everyone EXCEPT super admins
-- (cannot edit one, and cannot create or promote anyone into one).
drop policy if exists "profiles_super_admin_all" on public.profiles;
create policy "profiles_top_admin_all" on public.profiles for all
  using (public.is_top_admin()) with check (public.is_top_admin());
create policy "profiles_manager_all" on public.profiles for all
  using (public.is_super_admin() and role <> 'super_admin')
  with check (public.is_super_admin() and role <> 'super_admin');
-- Admin-HR and recruiters need driver names for Planning.
create policy "profiles_staff_read_drivers" on public.profiles for select
  using (public.current_role() in ('admin_hr', 'recruiter') and role = 'driver');

-- Companies: Admin-HR edits, recruiters view.
create policy "companies_hr_all" on public.companies for all
  using (public.current_role() = 'admin_hr') with check (public.current_role() = 'admin_hr');
create policy "companies_staff_read" on public.companies for select
  using (public.current_role() in ('admin_hr', 'recruiter'));

-- Employees: Admin-HR edits, recruiters view.
create policy "employees_hr_all" on public.employees for all
  using (public.current_role() = 'admin_hr') with check (public.current_role() = 'admin_hr');
create policy "employees_recruiter_read" on public.employees for select
  using (public.current_role() = 'recruiter');

-- Planning: Admin-HR and recruiters work with every driver's planning.
create policy "drivers_staff_read" on public.drivers for select
  using (public.current_role() in ('admin_hr', 'recruiter'));
create policy "plannings_staff_all" on public.plannings for all
  using (public.current_role() in ('admin_hr', 'recruiter')) with check (public.current_role() in ('admin_hr', 'recruiter'));
create policy "plannings_files_staff_all" on storage.objects for all to authenticated
  using (bucket_id = 'plannings' and public.current_role() in ('admin_hr', 'recruiter'))
  with check (bucket_id = 'plannings' and public.current_role() in ('admin_hr', 'recruiter'));

-- Posted routes: every signed-in role may see the posted list (read-only).
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
    and public.current_role() in ('super_admin', 'manager', 'admin_hr', 'recruiter', 'driver')
  order by p.full_name, r.id, s.sequence;
$$;

-- Audit log of user changes: who changed what, when. Only the server writes it (no insert policy).
create table public.role_audit_log (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid not null,
  target_name text,
  changed_by  uuid,
  changed_by_name text,
  action      text not null check (action in ('create', 'role_change', 'deactivate', 'reactivate')),
  old_role    text,
  new_role    text,
  created_at  timestamptz not null default now()
);
create index on public.role_audit_log (created_at desc);
create index on public.role_audit_log (target_id);
alter table public.role_audit_log enable row level security;
create policy "role_audit_admin_read" on public.role_audit_log for select using (public.is_super_admin());
