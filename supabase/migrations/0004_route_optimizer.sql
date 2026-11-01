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
