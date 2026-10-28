/**
 * Single list of every Admin Centre screen. To add a page: create its folder under
 * src/app/dashboard/, then add ONE entry here. Both hubs (super admin and company admin)
 * read this list, so the tile, its text and who can see it live in one place.
 */
export interface AdminNavItem {
  href: string;
  title: string;
  text: string;
  /** Who sees the tile. */
  roles: ("super_admin" | "company_admin")[];
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/dashboard/super-admin/branding", title: "Branding", text: "App name, logo and colours.", roles: ["super_admin"] },
  { href: "/dashboard/super-admin/companies", title: "Companies", text: "Add companies, set their colour, create their admins.", roles: ["super_admin"] },
  { href: "/dashboard/company-admin/drivers", title: "Drivers", text: "Create driver logins and set phone numbers.", roles: ["super_admin", "company_admin"] },
  { href: "/dashboard/company-admin/employees", title: "Employees", text: "Add the people who ride and manage their QR codes.", roles: ["super_admin", "company_admin"] },
  { href: "/dashboard/company-admin/boarding-points", title: "Boarding points", text: "Pick-up locations for each company.", roles: ["super_admin", "company_admin"] },
  { href: "/dashboard/company-admin/planning", title: "Planning", text: "Send drivers their shifts and see who received them.", roles: ["super_admin", "company_admin"] },
  { href: "/dashboard/company-admin/route-optimizer", title: "Route Optimizer", text: "Plan the best order of stops for each route.", roles: ["super_admin", "company_admin"] },
];
