import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { ADMIN_NAV } from "@/lib/admin-nav";

export const metadata = { title: "Company Admin" };

export default async function CompanyAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, company_id").eq("id", user!.id).single();
  const cid = profile?.company_id ?? "";

  const [{ count: drivers }, { count: employees }, { count: points }] = await Promise.all([
    supabase.from("drivers").select("*", { count: "exact", head: true }).eq("company_id", cid),
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("company_id", cid),
    supabase.from("boarding_points").select("*", { count: "exact", head: true }).eq("company_id", cid),
  ]);

  return (
    <div>
      <PageHeader title="Company Admin" subtitle="Manage your drivers, employees and boarding points." />
      {!profile?.company_id && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your account isn&apos;t linked to a company yet. Ask a super admin to link it.
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Drivers" value={drivers ?? 0} />
        <Stat label="Employees" value={employees ?? 0} />
        <Stat label="Boarding points" value={points ?? 0} />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {ADMIN_NAV.filter((i) => i.roles.includes("company_admin")).map((i) => (
          <Tile key={i.href} href={i.href} title={i.title} text={i.text} />
        ))}
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
