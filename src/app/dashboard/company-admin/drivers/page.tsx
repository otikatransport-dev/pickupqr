import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import DriversManager, { type DriverRow } from "./manager";

export const metadata = { title: "Drivers" };

export default async function DriversPage() {
  const { supabase, isSuper, companies, companyId } = await getAdminContext();
  const [{ data }, { data: profs }] = await Promise.all([
    supabase.from("drivers").select("id, profile_id, company_id, vehicle_number, phone, whatsapp_opt_in").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("role", "driver"),
  ]);
  const names = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
  const rows: DriverRow[] = (data ?? []).map((d) => ({
    id: d.id, profileId: d.profile_id, companyId: d.company_id, name: names.get(d.profile_id) || "Unnamed",
    vehicle: d.vehicle_number, phone: d.phone, optIn: d.whatsapp_opt_in,
  }));
  return (
    <div>
      <PageHeader title="Drivers" subtitle="Create driver logins. Drivers sign in with the email and temporary password you set." backHref={isSuper ? "/dashboard/super-admin" : "/dashboard/company-admin"} />
      <DriversManager initial={rows} companies={companies} isSuper={isSuper} defaultCompanyId={companyId ?? companies[0]?.id ?? ""} />
    </div>
  );
}
