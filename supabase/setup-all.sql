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

-- =========================================================================
-- Admin Centre: app-wide branding (name, colours, logo) editable by super admins.
-- Run AFTER 0001_init.sql and 0002_planning.sql. Safe to run once.
-- =========================================================================

create table public.app_settings (
  id            smallint primary key default 1 check (id = 1), -- exactly one row
  app_name      text not null default 'Otika Transport',
  brand_color   text not null default '#12284c',
  accent_color  text not null default '#f2a31b',
  logo_url      text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null,
  constraint app_settings_brand_hex  check (brand_color  ~ '^#[0-9a-fA-F]{6}$'),
  constraint app_settings_accent_hex check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint app_settings_name_len   check (char_length(app_name) between 1 and 60)
);

insert into public.app_settings (id) values (1);

-- Company colours are used for the colour-coded buttons: keep them valid too.
alter table public.companies
  add constraint companies_color_hex check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

alter table public.app_settings enable row level security;

-- Branding is not secret and the login page needs it before anyone is signed in.
create policy "app_settings_read_all" on public.app_settings for select
  to anon, authenticated using (true);
create policy "app_settings_super_admin_write" on public.app_settings for update
  using (public.is_super_admin()) with check (public.is_super_admin());
-- no insert/delete policy: the single row can only be edited, never added or removed.

-- Logos live in a public bucket (they are shown on the login page). Only super
-- admins can upload, replace or delete files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "branding_super_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_super_admin());
create policy "branding_super_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_super_admin());
create policy "branding_super_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_super_admin());

-- =========================================================================
-- Route Optimizer: each company gets its metro pick-up (ALLER) and drop-off (RETOUR)
-- stations, a contact and notes. Run AFTER 0003_admin_centre.sql.
-- =========================================================================
alter table public.companies
  add column metro_aller  text,
  add column metro_retour text,
  add column contact      text,
  add column notes        text;

-- A company admin may edit their own company (the Route Optimizer page does this).
-- Super admins already have full access; nobody else can write.
create policy "companies_company_admin_update" on public.companies for update
  using (public.is_company_admin_of(id)) with check (public.is_company_admin_of(id));

-- =========================================================================
-- Employee QR codes. Every employee already has a permanent, unique qr_token.
-- This adds "when was the QR code generated" and makes sure the token can never
-- change or be reused, so a QR code can never be duplicated.
-- Run AFTER 0004_route_optimizer.sql.
-- =========================================================================
alter table public.employees add column qr_generated_at timestamptz;

create function public.employees_lock_qr()
returns trigger
language plpgsql
as $$
begin
  if new.qr_token is distinct from old.qr_token then
    raise exception 'qr_token cannot be changed' using errcode = '42501';
  end if;
  -- the generation date is set once and then kept
  if old.qr_generated_at is not null then
    new.qr_generated_at := old.qr_generated_at;
  end if;
  return new;
end;
$$;

create trigger employees_lock_qr_trg
  before update on public.employees
  for each row execute procedure public.employees_lock_qr();

-- ===== 0006_profile_photos.sql =====
-- =========================================================================
-- Profile photos + a security fix. Run AFTER 0005_employee_qr.sql.
-- =========================================================================

-- 1. Photo link on every profile.
alter table public.profiles add column avatar_url text;

-- 2. SECURITY: "profiles_update_own" lets people edit their own row, which would also let them
--    change their own role or company. Only a super admin may change those two columns.
--    (The service role used by the server has no auth.uid(), so server-side admin work is unaffected.)
create function public.profiles_protect_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    new.role := old.role;
    new.company_id := old.company_id;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role_trg
  before update on public.profiles
  for each row execute procedure public.profiles_protect_role();

-- 3. Public bucket for photos (shown in headers and lists). 2 MB, images only.
--    Each person can add / replace / delete files only inside their own folder: <user id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Photos are public anyway; listing them lets uploads, replacements and deletes work smoothly.
create policy "avatars_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');
create policy "avatars_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_super_admin_all" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and public.is_super_admin())
  with check (bucket_id = 'avatars' and public.is_super_admin());

-- ===== 0007_company_master.sql =====
-- =========================================================================
-- Company master: ONE companies table for every screen. Run AFTER 0006.
-- Adds code / phone / coordinates / archive status, makes the name unique,
-- and a function that says where a company is used ("Linked records").
-- Existing data is kept: if two companies already share a name, the later
-- one is renamed "Name (2)" so the unique rule can be switched on.
-- =========================================================================
alter table public.companies
  add column if not exists code       text,
  add column if not exists phone      text,
  add column if not exists lat        double precision,
  add column if not exists lng        double precision,
  add column if not exists status     text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

alter table public.companies
  add constraint companies_status_check check (status in ('active', 'archived'));

-- Rename later duplicates (same name ignoring case/spaces) so the unique index can be built.
with ranked as (
  select id, name, row_number() over (partition by lower(btrim(name)) order by created_at, id) as rn
  from public.companies
)
update public.companies c set name = btrim(c.name) || ' (' || r.rn || ')'
from ranked r where r.id = c.id and r.rn > 1;

create unique index companies_name_unique on public.companies (lower(btrim(name)));
create unique index companies_code_unique on public.companies (lower(btrim(code))) where code is not null and btrim(code) <> '';

create or replace function public.companies_touch() returns trigger
language plpgsql as $$
begin
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before insert or update on public.companies
  for each row execute function public.companies_touch();

-- Where is each company used? One row per company; counts only what the caller may see (RLS applies).
create or replace function public.company_linked_records()
returns table (company_id uuid, employees bigint, drivers bigint, boarding_points bigint, routes bigint, plannings bigint)
language sql stable security invoker as $$
  select c.id,
    (select count(*) from public.employees e where e.company_id = c.id),
    (select count(*) from public.drivers d where d.company_id = c.id),
    (select count(*) from public.boarding_points b where b.company_id = c.id),
    (select count(*) from public.routes r where r.company_id = c.id),
    (select count(*) from public.plannings p where p.company_id = c.id)
  from public.companies c;
$$;

-- ===== 0008_driver_route_tracker.sql =====
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

-- NOTE: after this file, run 0009_roles_enum.sql ALONE, then 0010_roles_and_users.sql (they cannot share one run).

-- 0011 (run AFTER 0010 has succeeded)
-- =========================================================================
-- Phase 4: QR scans by company (recruiters) and Attendance with an audit trail. Run AFTER 0010.
-- =========================================================================

-- ---------- QR scans ----------
-- qr_scans already exists from the first setup (an unused driver-scan design). Keep it and extend it:
-- who scanned (a staff login), the day, and the employee's own company at scan time.
alter table public.qr_scans
  add column if not exists scanned_by uuid references public.profiles(id),
  add column if not exists scanned_on date,
  add column if not exists employee_company_id uuid references public.companies(id) on delete set null;
update public.qr_scans set scanned_on = (scanned_at at time zone 'America/Toronto')::date where scanned_on is null;
alter table public.qr_scans alter column scanned_on set not null, alter column scanned_on set default public.app_today();
-- Drivers no longer scan (see the permission matrix): drop their old policies.
drop policy if exists "qr_scans_driver_insert" on public.qr_scans;
drop policy if exists "qr_scans_driver_read_own" on public.qr_scans;
drop policy if exists "qr_scans_company_admin_read" on public.qr_scans;
create unique index if not exists qr_scans_once_per_day on public.qr_scans (employee_id, company_id, scanned_on);
create index if not exists qr_scans_company_time on public.qr_scans (company_id, scanned_at desc);
create policy "qr_scans_staff_read" on public.qr_scans for select
  using (public.current_role() in ('super_admin', 'manager', 'admin_hr', 'recruiter'));
-- Scans are written only by record_qr_scan() below, which checks the role (the admin tier also keeps its old full access).

-- Record a scan against the selected company. Returns what happened so the screen can show it.
create or replace function public.record_qr_scan(p_company uuid, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  emp record;
  rec record;
  existing timestamptz;
begin
  if me is null or public.current_role() not in ('super_admin', 'manager', 'admin_hr', 'recruiter') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from companies where id = p_company and status = 'active') then
    return jsonb_build_object('result', 'company_unavailable');
  end if;

  select e.id, e.name, e.company_id, e.active, e.qr_generated_at into emp from employees e where e.qr_token = p_token;
  if not found or emp.qr_generated_at is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if not emp.active then
    return jsonb_build_object('result', 'inactive', 'name', emp.name);
  end if;

  select scanned_at into existing from qr_scans where employee_id = emp.id and company_id = p_company and scanned_on = public.app_today();
  if found then
    return jsonb_build_object('result', 'duplicate', 'name', emp.name, 'scannedAt', existing,
      'otherCompany', emp.company_id is distinct from p_company);
  end if;

  insert into qr_scans (company_id, employee_id, scanned_by, employee_company_id)
    values (p_company, emp.id, me, emp.company_id) returning scanned_at into rec;
  return jsonb_build_object('result', 'ok', 'name', emp.name, 'scannedAt', rec.scanned_at,
    'otherCompany', emp.company_id is distinct from p_company);
end $$;
revoke all on function public.record_qr_scan(uuid, uuid) from public, anon;
grant execute on function public.record_qr_scan(uuid, uuid) to authenticated;

-- Today's scans for a company, with names (staff only).
create or replace function public.company_scans(p_company uuid, p_date date default public.app_today())
returns table (id uuid, employee_name text, scanned_at timestamptz, scanned_by_name text, other_company boolean)
language sql stable security definer set search_path = public
as $$
  select s.id, e.name, s.scanned_at, coalesce(nullif(p.full_name, ''), 'Staff'), s.employee_company_id is distinct from s.company_id
  from qr_scans s
  join employees e on e.id = s.employee_id
  join profiles p on p.id = s.scanned_by
  where s.company_id = p_company and s.scanned_on = p_date
    and public.current_role() in ('super_admin', 'manager', 'admin_hr', 'recruiter')
  order by s.scanned_at desc
  limit 500;
$$;
revoke all on function public.company_scans(uuid, date) from public, anon;
grant execute on function public.company_scans(uuid, date) to authenticated;

-- ---------- Attendance ----------
create table public.attendance (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  work_date  date not null default public.app_today(),
  status     text not null default 'present' check (status in ('present', 'late', 'absent', 'leave')),
  check_in   time,
  check_out  time,
  note       text check (char_length(note) <= 500),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);
create index on public.attendance (work_date);
alter table public.attendance enable row level security;
-- View: super admin, manager, Admin-HR see everyone; everyone else only their own rows.
create policy "attendance_read" on public.attendance for select
  using (user_id = auth.uid() or public.current_role() in ('super_admin', 'manager', 'admin_hr'));
-- Edit / overwrite / backfill: super admin, manager, Admin-HR. Nobody can delete.
create policy "attendance_write_insert" on public.attendance for insert
  with check (public.current_role() in ('super_admin', 'manager', 'admin_hr'));
create policy "attendance_write_update" on public.attendance for update
  using (public.current_role() in ('super_admin', 'manager', 'admin_hr'))
  with check (public.current_role() in ('super_admin', 'manager', 'admin_hr'));

create table public.attendance_audit (
  id           uuid primary key default gen_random_uuid(),
  attendance_id uuid not null,
  user_id      uuid not null,
  work_date    date not null,
  action       text not null check (action in ('create', 'update')),
  old_values   jsonb,
  new_values   jsonb not null,
  changed_by   uuid,
  changed_by_name text,
  changed_at   timestamptz not null default now()
);
create index on public.attendance_audit (attendance_id, changed_at desc);
create index on public.attendance_audit (changed_at desc);
alter table public.attendance_audit enable row level security;
create policy "attendance_audit_read" on public.attendance_audit for select
  using (public.current_role() in ('super_admin', 'manager', 'admin_hr'));
-- No insert policy: only the trigger below (and so every change, whoever makes it) writes the audit.

create or replace function public.attendance_stamp() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.updated_by := auth.uid();
  else
    -- the identity of a record never changes; only its values do
    new.user_id := old.user_id; new.work_date := old.work_date; new.created_by := old.created_by; new.created_at := old.created_at;
    new.updated_by := auth.uid(); new.updated_at := now();
  end if;
  return new;
end $$;
create trigger attendance_stamp before insert or update on public.attendance
  for each row execute function public.attendance_stamp();

create or replace function public.attendance_write_audit() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  actor_name text;
  snap_new jsonb := jsonb_build_object('status', new.status, 'check_in', new.check_in, 'check_out', new.check_out, 'note', new.note);
  snap_old jsonb;
begin
  select full_name into actor_name from profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into attendance_audit (attendance_id, user_id, work_date, action, old_values, new_values, changed_by, changed_by_name)
      values (new.id, new.user_id, new.work_date, 'create', null, snap_new, auth.uid(), actor_name);
  else
    snap_old := jsonb_build_object('status', old.status, 'check_in', old.check_in, 'check_out', old.check_out, 'note', old.note);
    if snap_old <> snap_new then
      insert into attendance_audit (attendance_id, user_id, work_date, action, old_values, new_values, changed_by, changed_by_name)
        values (new.id, new.user_id, new.work_date, 'update', snap_old, snap_new, auth.uid(), actor_name);
    end if;
  end if;
  return null;
end $$;
create trigger attendance_audit_trg after insert or update on public.attendance
  for each row execute function public.attendance_write_audit();

-- Drivers clock themselves in and out for today (their own row only).
create or replace function public.attendance_clock(p_out boolean default false)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  now_local time := (now() at time zone 'America/Toronto')::time(0);
  rid uuid;
begin
  if me is null or public.current_role() <> 'driver' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_out then
    update attendance set check_out = now_local where user_id = me and work_date = public.app_today() and check_in is not null returning id into rid;
    if rid is null then raise exception 'not_checked_in' using errcode = '22023'; end if;
  else
    insert into attendance (user_id, work_date, status, check_in) values (me, public.app_today(), 'present', now_local)
      on conflict (user_id, work_date) do update set check_in = coalesce(attendance.check_in, excluded.check_in),
        status = case when attendance.status = 'absent' then 'present' else attendance.status end
      returning id into rid;
  end if;
  return rid;
end $$;
revoke all on function public.attendance_clock(boolean) from public, anon;
grant execute on function public.attendance_clock(boolean) to authenticated;
