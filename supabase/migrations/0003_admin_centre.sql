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
