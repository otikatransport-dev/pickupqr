import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import RouteTracker from "./route-tracker";
import { todayMontreal, type TrackerCompany, type TrackerStop } from "@/lib/driver-route";

export const metadata = { title: "My Route" };

export default async function DriverRoutePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  // Only drivers plan a route. Managers and super admins oversee it from the Posted routes page.
  if (me?.role !== "driver") redirect("/unauthorized");

  const [{ data: companies }, { data: route }] = await Promise.all([
    supabase.from("companies").select("id, name, color, address, code, phone, contact").eq("status", "active").order("name"),
    supabase.from("driver_routes").select("id, status, route_date").eq("driver_id", user.id).eq("route_date", todayMontreal()).maybeSingle(),
  ]);
  const { data: stops } = route
    ? await supabase.from("driver_route_stops").select("company_id, vehicle_number, status, sequence").eq("route_id", route.id).order("sequence")
    : { data: [] };
  const initial: TrackerStop[] = (stops ?? []).map((s) => ({ companyId: s.company_id, vehicleNumber: s.vehicle_number ?? "", status: s.status }));

  return (
    <div className="relative left-1/2 w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2">
      <PageHeader title="My Route" subtitle="Drag companies from the left into your route, or tap Add. The top company is your first stop." />
      <RouteTracker companies={(companies ?? []) as TrackerCompany[]} initial={initial} initialStatus={route?.status ?? null} routeDate={route?.route_date ?? null} />
    </div>
  );
}
