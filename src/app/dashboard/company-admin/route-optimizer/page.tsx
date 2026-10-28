import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Route Optimizer" };

export default async function RouteOptimizerPage() {
  const { isSuper } = await getAdminContext();
  return (
    <div>
      <PageHeader
        title="Route Optimizer"
        subtitle="Plan the best order of stops for each route."
        backHref={isSuper ? "/dashboard/super-admin" : "/dashboard/company-admin"}
      />
      <div className="card p-6 text-center">
        <p className="text-base font-semibold">Coming soon</p>
        <p className="mt-1 text-sm text-neutral-500">
          This page is ready and waiting for its content. Once the Route Optimizer design is added, it will appear here.
        </p>
      </div>
    </div>
  );
}
