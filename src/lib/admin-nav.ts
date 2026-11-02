/**
 * Single list of every Admin Centre screen. To add a page: create its folder under
 * src/app/dashboard/, then add ONE entry here. Both hubs read this list and show a tile only
 * when the signed-in role has the capability (see src/lib/roles.ts), so the tile, its text and
 * who can see it live in one place.
 */
import type { Capability } from "@/lib/roles";

export interface AdminNavItem {
  href: string;
  title: string;
  text: string;
  /** The capability a role needs to see this tile. */
  cap: Capability;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/dashboard/super-admin/users", title: "Users & roles", text: "Create logins, change roles, deactivate accounts, see the change log.", cap: "users" },
  { href: "/dashboard/super-admin/branding", title: "Branding", text: "App name, logo and colours.", cap: "branding" },
  { href: "/dashboard/super-admin/companies", title: "Companies", text: "The one company list used everywhere.", cap: "companies_view" },
  { href: "/dashboard/company-admin/drivers", title: "Drivers", text: "Create and edit driver logins (name, phone, email, password).", cap: "drivers" },
  { href: "/dashboard/company-admin/employees", title: "Employees", text: "The people who ride and their QR codes.", cap: "employees_view" },
  { href: "/dashboard/company-admin/boarding-points", title: "Boarding points", text: "Pick-up locations for each company.", cap: "boarding_points" },
  { href: "/dashboard/company-admin/planning", title: "Planning", text: "Send drivers their shifts and see who received them.", cap: "planning" },
  { href: "/dashboard/posted-routes", title: "Posted routes", text: "Routes drivers have posted for the day.", cap: "posted_routes" },
  { href: "/dashboard/company-admin/route-optimizer", title: "Route Optimizer", text: "Metro pick-up and drop-off times for each company.", cap: "route_optimizer_view" },
];
