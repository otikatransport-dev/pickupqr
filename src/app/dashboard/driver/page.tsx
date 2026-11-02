import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AvatarUploader from "@/components/avatar-uploader";

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

  const { data: me } = await supabase.from("profiles").select("full_name, phone, avatar_url").eq("id", user!.id).single();

  const { data: routes } = driver
    ? await supabase.from("routes").select("id, status, boarding_point_id").eq("driver_id", driver.id)
    : { data: [] };

  return (
    <div>
      <section className="card p-4">
        <h2 className="mb-3 text-base font-semibold">My profile</h2>
        <AvatarUploader userId={user!.id} name={me?.full_name ?? user!.email ?? "Driver"} url={me?.avatar_url ?? null} />
        <p className="mt-3 text-sm font-medium">{me?.full_name}</p>
        {me?.phone && <p className="text-sm text-neutral-500">{me.phone}</p>}
      </section>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">My routes</h1>
      <p className="mt-1 text-sm text-neutral-500">You choose the company and enter your vehicle number when you plan a route.</p>
      <Link href="/dashboard/driver/route" className="mt-4 card-link">
        <p className="font-medium">Plan my route</p>
        <p className="text-sm text-neutral-500">Pick companies, set the order and enter your vehicle number.</p>
      </Link>
      <Link href="/dashboard/posted-routes" className="mt-3 card-link">
        <p className="font-medium">Posted routes</p>
        <p className="text-sm text-neutral-500">See the routes other drivers have posted today.</p>
      </Link>
      <Link
        href="/dashboard/driver/planning"
        className="mt-3 card-link"
      >
        <p className="font-medium">My planning</p>
        <p className="text-sm text-neutral-500">Your shifts, as sent by your admin.</p>
      </Link>
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
