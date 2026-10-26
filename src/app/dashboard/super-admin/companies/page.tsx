import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import CompaniesManager, { type CompanyRow, type AdminRow } from "./companies-manager";

export const metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "super_admin") redirect("/unauthorized");

  const [{ data: companies }, { data: admins }, { data: drivers }, { data: points }, { data: employees }] = await Promise.all([
    supabase.from("companies").select("id, name, color, logo_url, address").order("name"),
    supabase.from("profiles").select("id, full_name, phone, company_id").eq("role", "company_admin").order("full_name"),
    supabase.from("drivers").select("company_id"),
    supabase.from("boarding_points").select("company_id"),
    supabase.from("employees").select("company_id"),
  ]);

  const count = (rows: Array<{ company_id: string | null }> | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) if (r.company_id) m.set(r.company_id, (m.get(r.company_id) ?? 0) + 1);
    return m;
  };
  const dc = count(drivers), pc = count(points), ec = count(employees);

  const rows: CompanyRow[] = (companies ?? []).map((c) => ({
    ...c,
    drivers: dc.get(c.id) ?? 0,
    boardingPoints: pc.get(c.id) ?? 0,
    employees: ec.get(c.id) ?? 0,
  }));
  const adminRows: AdminRow[] = (admins ?? []).map((a) => ({
    id: a.id, name: a.full_name || "Unnamed", phone: a.phone, companyId: a.company_id,
  }));

  return (
    <div>
      <PageHeader title="Companies" subtitle="Add the companies you serve, set their colour, and give each one an admin login." backHref="/dashboard/super-admin" />
      <CompaniesManager initial={rows} admins={adminRows} />
    </div>
  );
}
