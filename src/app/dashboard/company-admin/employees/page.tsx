import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import Link from "next/link";
import EmployeesManager from "./manager";

export const metadata = { title: "Employees" };

export default async function EmployeesPage() {
  const { supabase, isSuper, companies, companyId } = await getAdminContext();
  const { data } = await supabase.from("employees").select("id, name, phone_normalized, company_id, active, qr_token, qr_generated_at").order("name");
  return (
    <div>
      <PageHeader title="Employees" subtitle="People who ride. Each one gets a personal QR code that drivers scan." />
      <Link href="/dashboard/company-admin/employees/bulk" className="btn-secondary mb-4 inline-flex">⬆ Add employees in bulk</Link>
      <EmployeesManager initial={data ?? []} companies={companies} isSuper={isSuper} defaultCompanyId={companyId ?? companies[0]?.id ?? ""} />
    </div>
  );
}
