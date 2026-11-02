import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import RouteOptimizer, { type CompanyRoute } from "./route-optimizer";

export const metadata = { title: "Route Optimizer" };

export default async function RouteOptimizerPage() {
  const { supabase, isSuper } = await getAdminContext();
  const { data } = await supabase
    .from("companies")
    .select("id, name, address, metro_aller, metro_retour, contact, notes, color")
    .eq("status", "active")
    .order("name");
  return (
    // The page needs more room than the other admin screens, so it breaks out of the narrow column.
    <div className="relative left-1/2 w-[min(72rem,calc(100vw-2rem))] -translate-x-1/2">
      <PageHeader
        title="Route Optimizer"
        subtitle="Panneau Trajets — ramassage et dépôt au métro pour chaque entreprise."
      />
      <RouteOptimizer initial={(data ?? []) as CompanyRoute[]} isSuper={isSuper} />
    </div>
  );
}
