/**
 * The parent map: for any dashboard page, the page "Back" should return to.
 * The Back bar (src/app/dashboard/back-bar.tsx) lives in the dashboard layout, so every page,
 * present and future, gets it automatically. Add an entry to LABELS for a friendlier name.
 */
const LABELS: Record<string, string> = {
  "/dashboard/super-admin": "Admin Centre",
  "/dashboard/company-admin": "Admin Centre",
  "/dashboard/attendance": "Attendance",
  "/dashboard/qr-scan": "QR scan",
  "/dashboard/driver": "Driver home",
  "/dashboard/employee": "Home",
  "/dashboard/company-admin/employees": "Employees",
  "/dashboard/company-admin/drivers": "Drivers",
  "/dashboard/driver/planning": "Planning",
  "/dashboard/driver/route": "My Route",
};

export { homeFor } from "@/lib/roles";
import { homeFor } from "@/lib/roles";

/** Returns the parent page and its label, or null on a home page (nothing above it). */
export function parentOf(pathname: string, role: string | null | undefined): { href: string; label: string } | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const home = homeFor(role);
  if (path === "/dashboard" || path === home) return null;
  // Pages that sit under a list page rather than directly under home.
  if (/^\/dashboard\/qr-scan\/[^/]+$/.test(path)) return { href: "/dashboard/qr-scan", label: "QR scan" };
  const parts = path.split("/").filter(Boolean); // ["dashboard","company-admin","employees","bulk"]
  // A section's top page (e.g. /dashboard/company-admin/planning) goes back to the user's own home.
  const parent = parts.length <= 3 ? home : "/" + parts.slice(0, -1).join("/");
  return { href: parent, label: LABELS[parent] ?? (parent === home ? "Home" : "Back") };
}
