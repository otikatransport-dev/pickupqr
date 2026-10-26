import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DriverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, vehicle_number, company_id")
    .eq("profile_id", user!.id)
    .single();

  const { data: routes } = driver
    ? await supabase.from("routes").select("id, status, boarding_point_id").eq("driver_id", driver.id)
    : { data: [] };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My routes</h1>
      <p className="mt-1 text-sm text-neutral-500">Vehicle: {driver?.vehicle_number ?? "not assigned"}</p>
      <Link
        href="/dashboard/driver/planning"
        className="mt-4 card-link"
      >
        <p className="font-medium">My planning</p>
        <p className="text-sm text-neutral-500">Your shifts, as sent by your admin.</p>
      </Link>
      <p className="mt-4 text-sm text-neutral-500">
        The route planner, company selector, and QR scanner from earlier phases plug in here next.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {(routes ?? []).map((r) => (
          <li key={r.id} className="rounded-lg border border-neutral-200 bg-white p-3 text-sm">
            Route {r.id.slice(0, 8)} — {r.status}
          </li>
        ))}
        {(!routes || routes.length === 0) && (
          <li className="rounded-lg border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
            No routes assigned yet.
          </li>
        )}
      </ul>
    </div>
  );
}
