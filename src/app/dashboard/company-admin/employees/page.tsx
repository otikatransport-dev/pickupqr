import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import EmployeesManager from "./manager";

export const metadata = { title: "Employees" };

export default async function EmployeesPage() {
  const { supabase, isSuper, companies, companyId } = await getAdminContext();
  const { data } = await supabase.from("employees").select("id, name, phone_normalized, company_id, active").order("name");
  return (
    <div>
      <PageHeader title="Employees" subtitle="People who ride. Each one gets a personal QR code that drivers scan." backHref={isSuper ? "/dashboard/super-admin" : "/dashboard/company-admin"} />
      <EmployeesManager initial={data ?? []} companies={companies} isSuper={isSuper} defaultCompanyId={companyId ?? companies[0]?.id ?? ""} />
    </div>
  );
}
