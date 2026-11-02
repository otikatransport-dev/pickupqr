import { can, isAdminTier, type Capability } from "@/lib/roles";

/** Which capability a dashboard URL needs. Longest prefix wins. Paths not listed are open to any signed-in user. */
const PATH_RULES: [string, Capability | "employee_home"][] = [
  ["/dashboard/super-admin/branding", "branding"],
  ["/dashboard/super-admin/users", "users"],
  ["/dashboard/super-admin/companies", "companies_view"],
  ["/dashboard/super-admin", "admin_hub"],
  ["/dashboard/company-admin/drivers", "drivers"],
  ["/dashboard/company-admin/boarding-points", "boarding_points"],
  ["/dashboard/company-admin/employees", "employees_view"],
  ["/dashboard/company-admin/planning", "planning"],
  ["/dashboard/company-admin/route-optimizer", "route_optimizer_view"],
  ["/dashboard/company-admin", "staff_hub"],
  ["/dashboard/driver/route", "route_tracker"],
  ["/dashboard/driver/planning", "driver_planning"],
  ["/dashboard/driver", "driver_planning"],
  ["/dashboard/posted-routes", "posted_routes"],
  ["/dashboard/attendance", "attendance_view"],
  ["/dashboard/qr-scan", "qr_scan"],
  ["/dashboard/employee", "employee_home"],
];

/** May this role open this dashboard URL? (Super admins and managers may open every page.) */
export function canOpenPath(role: string | null | undefined, pathname: string): boolean {
  if (isAdminTier(role)) return true;
  const path = pathname.replace(/\/+$/, "");
  const rule = PATH_RULES.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"));
  if (!rule) return true;
  return rule[1] === "employee_home" ? role === "employee" : can(role, rule[1]);
}
