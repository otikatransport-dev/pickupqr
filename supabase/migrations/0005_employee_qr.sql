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
