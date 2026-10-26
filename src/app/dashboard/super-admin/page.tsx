import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Admin Centre" };

export default async function SuperAdminPage() {
  const supabase = await createClient();
  const c = (t: "companies" | "drivers" | "employees" | "boarding_points") =>
    supabase.from(t).select("*", { count: "exact", head: true });
  const [{ count: companies }, { count: drivers }, { count: employees }, { count: points }] = await Promise.all([
    c("companies"), c("drivers"), c("employees"), c("boarding_points"),
  ]);

  return (
    <div>
      <PageHeader title="Admin Centre" subtitle="Change how the app looks and manage all of your data." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Companies" value={companies ?? 0} />
        <Stat label="Drivers" value={drivers ?? 0} />
        <Stat label="Employees" value={employees ?? 0} />
        <Stat label="Boarding points" value={points ?? 0} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Tile href="/dashboard/super-admin/branding" title="Branding" text="App name, logo and colours." />
        <Tile href="/dashboard/super-admin/companies" title="Companies" text="Add companies, set their colour, create their admins." />
        <Tile href="/dashboard/company-admin/drivers" title="Drivers" text="Create driver logins and set phone numbers." />
        <Tile href="/dashboard/company-admin/employees" title="Employees" text="Add the people who ride and manage their QR codes." />
        <Tile href="/dashboard/company-admin/boarding-points" title="Boarding points" text="Pick-up locations for each company." />
        <Tile href="/dashboard/company-admin/planning" title="Planning" text="Send drivers their shifts and see who received them." />
      </div>
    </div>
  );
}

function Tile({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="card-link">
      <p className="font-medium">{title}</p>
      <p className="text-sm text-neutral-500">{text}</p>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="text-3xl font-bold text-brand">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}
