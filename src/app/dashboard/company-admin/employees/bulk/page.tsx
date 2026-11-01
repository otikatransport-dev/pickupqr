import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import BulkEmployees from "./bulk-employees";

export const metadata = { title: "Add employees in bulk" };

export default async function BulkEmployeesPage() {
  const { isSuper, companies, companyId } = await getAdminContext();
  return (
    <div>
      <PageHeader title="Add employees in bulk" subtitle="Bring in names, phone numbers and companies from a Google Sheet or a CSV file." backHref="/dashboard/company-admin/employees" backLabel="Employees" />
      <BulkEmployees companies={companies} isSuper={isSuper} ownCompanyId={companyId} />
    </div>
  );
}
