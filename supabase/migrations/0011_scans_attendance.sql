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
