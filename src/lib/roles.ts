/**
 * Roles and the permission matrix: the ONE place that says who may do what in the app.
 * The database (Row Level Security) and the API routes enforce the same rules again,
 * so hiding a button here is never the only protection.
 *
 * Ladder: super_admin > manager > admin_hr > recruiter > driver   (employee = QR-pass holder only)
 */
export type AppRoleName = "super_admin" | "manager" | "admin_hr" | "recruiter" | "driver" | "employee" | "company_admin";

/** The five roles an admin can give to a login. */
export const LOGIN_ROLES = ["super_admin", "manager", "admin_hr", "recruiter", "driver"] as const;
export type LoginRole = (typeof LOGIN_ROLES)[number];

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  admin_hr: "Admin-HR",
  recruiter: "Recruiter",
  driver: "Driver",
  employee: "Employee",
  company_admin: "Company admin (old)",
};

export type Capability =
  | "admin_hub" | "staff_hub" | "users" | "branding"
  | "companies_view" | "companies_edit"
  | "route_optimizer_view" | "route_optimizer_edit"
  | "planning" | "employees_view" | "employees_edit" | "boarding_points" | "drivers"
  | "route_tracker" | "posted_routes" | "driver_planning"
  | "attendance_view" | "attendance_edit" | "qr_scan";

const ADMIN_TIER: AppRoleName[] = ["super_admin", "manager"];
const HR_UP: AppRoleName[] = [...ADMIN_TIER, "admin_hr"];
const STAFF: AppRoleName[] = [...HR_UP, "recruiter"];

const MATRIX: Record<Capability, AppRoleName[]> = {
  admin_hub: ADMIN_TIER,
  staff_hub: STAFF,
  users: ADMIN_TIER,
  branding: ADMIN_TIER,
  boarding_points: ADMIN_TIER,
  drivers: ADMIN_TIER,
  companies_view: STAFF,
  companies_edit: HR_UP,
  route_optimizer_view: STAFF,
  route_optimizer_edit: HR_UP,
  planning: STAFF,
  employees_view: STAFF,
  employees_edit: HR_UP,
  route_tracker: ["driver"],
  driver_planning: ["driver"],
  posted_routes: [...STAFF, "driver"],
  attendance_view: [...HR_UP, "driver"], // drivers see only their own rows (enforced by the database)
  attendance_edit: HR_UP,
  qr_scan: STAFF,
};

export function can(role: string | null | undefined, cap: Capability): boolean {
  return !!role && MATRIX[cap].includes(role as AppRoleName);
}

/** The admin tier (super admin + manager) has access to everything. */
export const isAdminTier = (role: string | null | undefined) => role === "super_admin" || role === "manager";

/** Where a role lands after sign-in, and what "home" means for the Back button. */
export function homeFor(role: string | null | undefined): string {
  switch (role) {
    case "super_admin":
    case "manager":
      return "/dashboard/super-admin";
    case "admin_hr":
    case "recruiter":
      return "/dashboard/company-admin";
    case "driver":
      return "/dashboard/driver";
    default:
      return "/dashboard/employee";
  }
}
