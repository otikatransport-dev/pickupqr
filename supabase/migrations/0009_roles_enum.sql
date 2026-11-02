-- =========================================================================
-- Roles, step 1 of 2. Run this file ALONE, then run 0010_roles_and_users.sql.
-- (Postgres only lets a new role name be used after the statement that adds it has finished.)
-- Adds the three new roles: manager, admin_hr (Admin-HR), recruiter.
-- =========================================================================
alter type public.app_role add value if not exists 'manager';
alter type public.app_role add value if not exists 'admin_hr';
alter type public.app_role add value if not exists 'recruiter';
