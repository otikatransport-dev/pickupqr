import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import BoardingPointsManager from "./manager";

export const metadata = { title: "Boarding points" };

export default async function BoardingPointsPage() {
  const { supabase, isSuper, companies, companyId } = await getAdminContext();
  const { data } = await supabase.from("boarding_points").select("id, company_id, name, address").order("name");
  return (
    <div>
      <PageHeader title="Boarding points" subtitle="The places where employees get on. Drivers pick from this list." backHref={isSuper ? "/dashboard/super-admin" : "/dashboard/company-admin"} />
      <BoardingPointsManager initial={data ?? []} companies={companies} isSuper={isSuper} defaultCompanyId={companyId ?? companies[0]?.id ?? ""} />
    </div>
  );
}
