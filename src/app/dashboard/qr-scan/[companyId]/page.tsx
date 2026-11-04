import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Dot, PageHeader } from "@/components/ui";
import { can } from "@/lib/roles";
import Scanner from "./scanner";

export const metadata = { title: "Scan QR codes" };

export default async function ScanCompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!can(me?.role, "qr_scan")) redirect("/unauthorized");

  const { data: company } = await supabase.from("companies").select("id, name, color, status").eq("id", companyId).maybeSingle();
  if (!company || company.status !== "active") notFound();
  const { data: scans } = await supabase.rpc("company_scans", { p_company: companyId });

  return (
    <div>
      <PageHeader title={company.name} subtitle="Scan an employee's QR code. Each person is recorded once per day for this company." />
      <p className="-mt-3 mb-4 flex items-center gap-2 text-sm text-neutral-500"><Dot color={company.color} /> Scanning for {company.name}</p>
      <Scanner companyId={company.id} initialScans={scans ?? []} />
    </div>
  );
}
