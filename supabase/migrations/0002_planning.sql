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
