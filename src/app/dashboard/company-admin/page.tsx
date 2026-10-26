import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function CompanyAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user!.id).single();

  const [{ count: drivers }, { count: employees }, { count: boardingPoints }] = await Promise.all([
    supabase.from("drivers").select("*", { count: "exact", head: true }).eq("company_id", profile?.company_id ?? ""),
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("company_id", profile?.company_id ?? ""),
    supabase.from("boarding_points").select("*", { count: "exact", head: true }).eq("company_id", profile?.company_id ?? ""),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Company Admin</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Boarding points, employee directory, and route management UI land in the next phases.
      </p>
      {!profile?.company_id && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your profile isn&apos;t linked to a company yet — set <code>company_id</code> on your profile row.
        </p>
      )}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Drivers" value={drivers ?? 0} />
        <Stat label="Employees" value={employees ?? 0} />
        <Stat label="Boarding points" value={boardingPoints ?? 0} />
      </div>
      <Link
        href="/dashboard/company-admin/planning"
        className="mt-6 card-link"
      >
        <p className="font-medium">Planning</p>
        <p className="text-sm text-neutral-500">Send each driver their shifts and see who has received them.</p>
      </Link>
    </div>
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
