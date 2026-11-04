import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Dot, Empty, PageHeader } from "@/components/ui";
import { can } from "@/lib/roles";

export const metadata = { title: "QR scan" };

/** Step 1 of scanning: choose the company (from the shared company list). */
export default async function QrScanCompaniesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!can(me?.role, "qr_scan")) redirect("/unauthorized");

  const { data: companies, error } = await supabase.from("companies").select("id, name, color, address, code").eq("status", "active").order("name");
  return (
    <div>
      <PageHeader title="QR scan" subtitle="Choose the company, then scan each employee's QR code." />
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">Could not load companies.</p>
        : !companies?.length ? <Empty>No companies yet. Add one in Companies first.</Empty>
        : (
          <div className="grid gap-3 sm:grid-cols-2">
            {companies.map((c) => (
              <Link key={c.id} href={`/dashboard/qr-scan/${c.id}`} className="card-link">
                <p className="flex items-center gap-2 font-medium"><Dot color={c.color} />{c.name}</p>
                {(c.address || c.code) && <p className="text-sm text-neutral-500">{[c.code, c.address].filter(Boolean).join(" · ")}</p>}
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}
