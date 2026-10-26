-- =========================================================================
-- PickupQR — foundation schema, RBAC, and Row Level Security
-- Run this once against a fresh Supabase project (see README.md §2).
-- =========================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- -------------------------------------------------------------------------
-- 1. ROLES
-- -------------------------------------------------------------------------
create type app_role as enum ('super_admin', 'company_admin', 'driver', 'employee');

-- -------------------------------------------------------------------------
-- 2. CORE TABLES
-- -------------------------------------------------------------------------

-- Assumption: Supabase already provides `auth.users` for login identity.
-- `profiles` is the public-facing 1:1 extension that carries app role,
-- name, phone and (for company_admin/driver/employee) which company they
-- belong to. Every table below hangs off `profiles`, not `auth.users`,
-- so RLS policies never have to touch the protected `auth` schema.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  role        app_role not null default 'employee',
  company_id  uuid, -- FK added after `companies` exists (see below)
  created_at  timestamptz not null default now()
);

create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text,        -- hex code for the color-coded company button (Task 1)
  logo_url    text,
  address     text,
  created_at  timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete set null;

create table public.drivers (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null unique references public.profiles(id) on delete cascade,
  company_id      uuid references public.companies(id) on delete set null,
  vehicle_number  text,
  phone           text,
  created_at      timestamptz not null default now()
);

create table public.boarding_points (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  address     text,
  lat         double precision,
  lng         double precision,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.routes (
  id                  uuid primary key default gen_random_uuid(),
  driver_id           uuid not null references public.drivers(id) on delete cascade,
  company_id          uuid not null references public.companies(id) on delete cascade,
  boarding_point_id   uuid not null references public.boarding_points(id) on delete restrict,
  route_geometry      jsonb,        -- e.g. GeoJSON LineString for the map preview
  map_preview_url     text,
  status              text not null default 'active', -- active | archived
  created_at          timestamptz not null default now()
);

-- Employee Directory (Task 3). `profile_id` is nullable: most employees are
-- bulk-imported for QR purposes only and never log in. If an employee IS
-- also an authenticated user (role = 'employee'), link the two rows here.
create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid references public.profiles(id) on delete set null,
  name              text not null,
  phone_normalized  text not null, -- E.164, e.g. +15145551234
  company_id        uuid references public.companies(id) on delete set null,
  qr_token          uuid not null unique default gen_random_uuid(),
  qr_image_url      text,
  last_scanned_at   timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  -- One name+phone can only ever have one QR, even if company changes later.
  constraint employees_name_phone_unique unique (name, phone_normalized)
);

create table public.qr_scans (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references public.employees(id) on delete cascade,
  scanned_by_driver_id  uuid references public.drivers(id) on delete set null,
  company_id            uuid references public.companies(id) on delete set null,
  scanned_at            timestamptz not null default now(),
  assigned_company_id   uuid references public.companies(id) on delete set null
);

create table public.whatsapp_accounts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  waba_id          text,
  phone_number_id  text,
  access_token     text, -- long-lived token; treat this table as secret (service-role only)
  status           text not null default 'disconnected', -- disconnected | pending | connected
  created_at       timestamptz not null default now()
);

create table public.whatsapp_messages (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  template_name  text,
  status         text, -- queued | sent | delivered | failed
  sent_at        timestamptz not null default now()
);

create index on public.profiles (company_id);
create index on public.drivers (company_id);
create index on public.boarding_points (company_id);
create index on public.routes (driver_id);
create index on public.routes (company_id);
create index on public.employees (company_id);
create index on public.employees (phone_normalized);
create index on public.qr_scans (employee_id);

-- -------------------------------------------------------------------------
-- 3. AUTO-CREATE A PROFILE ROW WHEN SOMEONE SIGNS UP
-- -------------------------------------------------------------------------
-- New signups default to 'employee' — the lowest-privilege role. Promote
-- someone to company_admin/driver/super_admin explicitly afterwards
-- (see README.md §5 for the first super_admin).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.phone,
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'employee')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -------------------------------------------------------------------------
-- 4. RBAC HELPER FUNCTIONS (used inside RLS policies below)
-- -------------------------------------------------------------------------
create function public.current_role()
returns app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.current_company_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_role() = 'super_admin';
$$;

create function public.is_company_admin_of(target_company uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_role() = 'company_admin' and public.current_company_id() = target_company;
$$;

-- -------------------------------------------------------------------------
-- 5. ENABLE RLS EVERYWHERE
-- -------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.drivers enable row level security;
alter table public.boarding_points enable row level security;
alter table public.routes enable row level security;
alter table public.employees enable row level security;
alter table public.qr_scans enable row level security;
alter table public.whatsapp_accounts enable row level security;
alter table public.whatsapp_messages enable row level security;

-- -------------------------------------------------------------------------
-- 6. POLICIES
-- -------------------------------------------------------------------------

-- profiles: everyone can read/update their own row; super_admin sees/edits
-- all; company_admin can read (not edit) profiles in their own company.
create policy "profiles_select_own" on public.profiles for select
  using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update
  using (id = auth.uid());
create policy "profiles_super_admin_all" on public.profiles for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "profiles_company_admin_read" on public.profiles for select
  using (public.current_role() = 'company_admin' and company_id = public.current_company_id());

-- companies: super_admin manages all; everyone else can only read the
-- company they belong to (drivers/employees need this to render names/colors).
create policy "companies_super_admin_all" on public.companies for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "companies_member_read" on public.companies for select
  using (id = public.current_company_id());

-- drivers: super_admin all; company_admin manages drivers in their company;
-- a driver can read their own row.
create policy "drivers_super_admin_all" on public.drivers for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "drivers_company_admin_all" on public.drivers for all
  using (public.is_company_admin_of(company_id)) with check (public.is_company_admin_of(company_id));
create policy "drivers_self_read" on public.drivers for select
  using (profile_id = auth.uid());

-- boarding_points: super_admin all; company_admin manages their own
-- company's list (create/edit/delete per spec §3.2); drivers/employees
-- in that company can read it.
create policy "boarding_points_super_admin_all" on public.boarding_points for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "boarding_points_company_admin_all" on public.boarding_points for all
  using (public.is_company_admin_of(company_id)) with check (public.is_company_admin_of(company_id));
create policy "boarding_points_member_read" on public.boarding_points for select
  using (company_id = public.current_company_id());

-- routes: super_admin all; company_admin manages routes for their company;
-- a driver can read only routes assigned to them.
create policy "routes_super_admin_all" on public.routes for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "routes_company_admin_all" on public.routes for all
  using (public.is_company_admin_of(company_id)) with check (public.is_company_admin_of(company_id));
create policy "routes_driver_read_own" on public.routes for select
  using (driver_id in (select id from public.drivers where profile_id = auth.uid()));

-- employees (directory): super_admin all; company_admin manages employees
-- in their company OR with no company yet (so they can claim/assign them);
-- an employee with a linked profile can read only their own row.
create policy "employees_super_admin_all" on public.employees for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "employees_company_admin_all" on public.employees for all
  using (
    public.current_role() = 'company_admin'
    and (company_id = public.current_company_id() or company_id is null)
  )
  with check (
    public.current_role() = 'company_admin'
    and (company_id = public.current_company_id() or company_id is null)
  );
create policy "employees_self_read" on public.employees for select
  using (profile_id = auth.uid());

-- qr_scans: super_admin all; company_admin reads scans tied to their
-- company; drivers can insert a scan and read their own scans.
create policy "qr_scans_super_admin_all" on public.qr_scans for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "qr_scans_company_admin_read" on public.qr_scans for select
  using (public.current_role() = 'company_admin' and company_id = public.current_company_id());
create policy "qr_scans_driver_insert" on public.qr_scans for insert
  with check (scanned_by_driver_id in (select id from public.drivers where profile_id = auth.uid()));
create policy "qr_scans_driver_read_own" on public.qr_scans for select
  using (scanned_by_driver_id in (select id from public.drivers where profile_id = auth.uid()));

-- whatsapp_accounts / whatsapp_messages: contain access tokens — keep these
-- locked to super_admin + the owning company_admin only (never exposed to
-- drivers/employees). Prefer touching access_token via the service role
-- from a server route rather than the browser client.
create policy "whatsapp_accounts_super_admin_all" on public.whatsapp_accounts for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "whatsapp_accounts_company_admin_all" on public.whatsapp_accounts for all
  using (public.is_company_admin_of(company_id)) with check (public.is_company_admin_of(company_id));

create policy "whatsapp_messages_super_admin_all" on public.whatsapp_messages for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "whatsapp_messages_company_admin_read" on public.whatsapp_messages for select
  using (
    employee_id in (
      select id from public.employees where company_id = public.current_company_id()
    )
    and public.current_role() = 'company_admin'
  );

-- =========================================================================
-- End of foundation migration.
-- =========================================================================


-- ===== 0002_planning.sql =====
-- =========================================================================
-- PickupQR — Planning (shift sheets sent to drivers)
-- Run AFTER 0001_init.sql. Never edit 0001 once it has been applied.
--
-- Adds:
--   * drivers.whatsapp_opt_in      – consent flag, required before any WhatsApp send
--   * plannings                    – one row per planning image sent to a driver
--   * storage bucket "plannings"   – private; images live at <driver_id>/<date>/<file>
--   * RLS: admins manage, a driver can only ever read their own plannings
--   * two tiny RPCs so drivers can flip their own opt-in / mark a planning seen
--     without being given UPDATE rights on the whole drivers/plannings rows
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. WhatsApp consent on drivers
-- -------------------------------------------------------------------------
alter table public.drivers
  add column if not exists whatsapp_opt_in    boolean not null default false,
  add column if not exists whatsapp_opt_in_at timestamptz;

-- -------------------------------------------------------------------------
-- 2. plannings
-- -------------------------------------------------------------------------
create table public.plannings (
  id                   uuid primary key default gen_random_uuid(),
  driver_id            uuid not null references public.drivers(id) on delete cascade,
  -- Always copied from the driver by the trigger below; the client cannot choose it.
  company_id           uuid references public.companies(id) on delete set null,
  plan_date            date not null,
  shift_label          text,            -- the "clase" read from the sheet (optional)
  notice               text,            -- free text shown with the planning in the app
  image_path           text not null,   -- path inside the "plannings" storage bucket
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  viewed_at            timestamptz,     -- first time the driver opened it in the app
  -- WhatsApp delivery tracking (null = never sent over WhatsApp)
  whatsapp_status      text check (whatsapp_status in ('queued','sent','delivered','read','failed')),
  whatsapp_message_id  text,
  whatsapp_error       text,
  whatsapp_sent_at     timestamptz
);

create index on public.plannings (driver_id, plan_date desc);
create index on public.plannings (plan_date);
create index on public.plannings (company_id);
create index on public.plannings (whatsapp_message_id) where whatsapp_message_id is not null;

create function public.plannings_set_company()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select company_id into new.company_id from public.drivers where id = new.driver_id;
  return new;
end;
$$;

create trigger plannings_set_company_trg
  before insert or update of driver_id on public.plannings
  for each row execute procedure public.plannings_set_company();

alter table public.plannings enable row level security;

create policy "plannings_super_admin_all" on public.plannings for all
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "plannings_company_admin_all" on public.plannings for all
  using (public.is_company_admin_of(company_id))
  with check (public.is_company_admin_of(company_id));

-- A driver can read only plannings addressed to their own driver row.
create policy "plannings_driver_read_own" on public.plannings for select
  using (driver_id in (select id from public.drivers where profile_id = auth.uid()));

-- -------------------------------------------------------------------------
-- 3. Private storage bucket for the images
-- -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plannings', 'plannings', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Folder 1 of the object path is the driver id: <driver_id>/<yyyy-mm-dd>/<file>
create policy "plannings_files_admin_all" on storage.objects for all to authenticated
  using (
    bucket_id = 'plannings' and (
      public.is_super_admin() or exists (
        select 1 from public.drivers d
        where d.id::text = (storage.foldername(name))[1]
          and public.is_company_admin_of(d.company_id)
      )
    )
  )
  with check (
    bucket_id = 'plannings' and (
      public.is_super_admin() or exists (
        select 1 from public.drivers d
        where d.id::text = (storage.foldername(name))[1]
          and public.is_company_admin_of(d.company_id)
      )
    )
  );

create policy "plannings_files_driver_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'plannings' and exists (
      select 1 from public.drivers d
      where d.id::text = (storage.foldername(name))[1]
        and d.profile_id = auth.uid()
    )
  );

-- -------------------------------------------------------------------------
-- 4. Narrow RPCs for the driver (no broad UPDATE rights needed)
-- -------------------------------------------------------------------------
create function public.set_my_whatsapp_opt_in(opt_in boolean)
returns void
language sql
security definer set search_path = public
as $$
  update public.drivers
     set whatsapp_opt_in    = opt_in,
         whatsapp_opt_in_at = case when opt_in then now() else null end
   where profile_id = auth.uid();
$$;

create function public.mark_planning_viewed(planning_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.plannings p
     set viewed_at = now()
   where p.id = planning_id
     and p.viewed_at is null
     and p.driver_id in (select id from public.drivers where profile_id = auth.uid());
$$;

revoke all on function public.set_my_whatsapp_opt_in(boolean) from public, anon;
revoke all on function public.mark_planning_viewed(uuid) from public, anon;
grant execute on function public.set_my_whatsapp_opt_in(boolean) to authenticated;
grant execute on function public.mark_planning_viewed(uuid) to authenticated;

-- =========================================================================
-- End of 0002_planning.sql
-- =========================================================================
