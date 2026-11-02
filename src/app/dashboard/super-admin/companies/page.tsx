import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import CompaniesManager, { type CompanyRow } from "./companies-manager";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: startNew } = await searchParams;
  const { supabase, canEdit } = await getAdminContext("companies_view", "companies_edit");
  const [{ data: companies }, { data: linked }] = await Promise.all([
    supabase.from("companies").select("id, name, code, phone, contact, lat, lng, status, color, logo_url, address").order("name"),
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
      stops: Number(u?.route_stops ?? 0),
    };
  });

  return (
    <div>
      <PageHeader title="Companies" subtitle="The one company list used by Route Optimizer, Planning and the driver screens." />
      <CompaniesManager initial={rows} startNew={startNew === "1" && canEdit} canEdit={canEdit} />
    </div>
  );
}
