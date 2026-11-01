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
