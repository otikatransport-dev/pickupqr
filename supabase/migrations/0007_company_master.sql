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
