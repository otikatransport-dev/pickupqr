import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function SuperAdminPage() {
  const supabase = await createClient();
  const [{ count: companies }, { count: drivers }, { count: employees }] = await Promise.all([
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("drivers").select("*", { count: "exact", head: true }),
    supabase.from("employees").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Super Admin</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Foundation phase — company/driver/employee management UI lands in the next phase.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Companies" value={companies ?? 0} />
        <Stat label="Drivers" value={drivers ?? 0} />
        <Stat label="Employees" value={employees ?? 0} />
      </div>
      <Link
        href="/dashboard/company-admin/planning"
        className="mt-6 card-link"
      >
        <p className="font-medium">Planning</p>
        <p className="text-sm text-neutral-500">Send drivers their shifts and see who has received them.</p>
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
