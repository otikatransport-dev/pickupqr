import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import CompaniesManager, { type CompanyRow, type AdminRow } from "./companies-manager";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: startNew } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "super_admin") redirect("/unauthorized");

  const [{ data: companies }, { data: admins }, { data: linked }] = await Promise.all([
    supabase.from("companies").select("id, name, code, phone, contact, lat, lng, status, color, logo_url, address").order("name"),
    supabase.from("profiles").select("id, full_name, phone, company_id").eq("role", "company_admin").order("full_name"),
    supabase.rpc("company_linked_records"),
  ]);
  const usage = new Map((linked ?? []).map((u) => [u.company_id, u]));

  const rows: CompanyRow[] = (companies ?? []).map((c) => {
    const u = usage.get(c.id);
    return {
      ...c,
      status: c.status ?? "active",
      drivers: Number(u?.drivers ?? 0),
      boardingPoints: Number(u?.boarding_points ?? 0),
      employees: Number(u?.employees ?? 0),
      routes: Number(u?.routes ?? 0),
      plannings: Number(u?.plannings ?? 0),
    };
  });
  const adminRows: AdminRow[] = (admins ?? []).map((a) => ({
    id: a.id, name: a.full_name || "Unnamed", phone: a.phone, companyId: a.company_id,
  }));

  return (
    <div>
      <PageHeader title="Companies" subtitle="Add the companies you serve, set their colour, and give each one an admin login." />
      <CompaniesManager initial={rows} admins={adminRows} startNew={startNew === "1"} />
    </div>
  );
}
