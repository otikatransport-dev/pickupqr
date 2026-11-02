import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { Dot, Empty, PageHeader } from "@/components/ui";
import { todayMontreal } from "@/lib/driver-route";

export const metadata = { title: "Posted routes" };

const STATUS: Record<string, string> = { submitted: "Posted", completed: "Completed", pending: "Pending", in_progress: "In progress" };

export default async function PostedRoutesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: raw } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  // Drivers see everyone's posted routes; super admins oversee all; company admins only see their own company's stops.
  if (!can(me?.role, "posted_routes")) redirect("/unauthorized");

  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayMontreal();
  const { data, error } = await supabase.rpc("posted_routes", { p_date: date });

  const routes = new Map<string, { driver: string; own: boolean; status: string; stops: NonNullable<typeof data> }>();
  for (const r of data ?? []) {
    const e = routes.get(r.route_id) ?? { driver: r.driver_name, own: r.driver_id === user.id, status: r.route_status, stops: [] };
    e.stops.push(r); routes.set(r.route_id, e);
  }

  return (
    <div>
      <PageHeader title="Posted routes" subtitle="Routes drivers have posted for the day. Read-only." />
      <form className="mb-4 flex items-end gap-2" method="get">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">Date
          <input className="field" type="date" name="date" defaultValue={date} />
        </label>
        <button className="btn-secondary">Show</button>
      </form>
      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">Could not load posted routes. The route feature may not be set up yet (database update 0008).</p>
      ) : routes.size === 0 ? (
        <Empty>No routes have been posted for {date}.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {[...routes.entries()].map(([id, r]) => (
            <li key={id} className="card p-4">
              <p className="flex items-center justify-between gap-2 font-semibold">
                <span>{r.driver}{r.own && <span className="ml-2 text-xs font-normal text-neutral-500">(you)</span>}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">{STATUS[r.status] ?? r.status}</span>
              </p>
              <ol className="mt-2 space-y-1.5">
                {r.stops.map((s) => (
                  <li key={s.company_id} className="flex items-center gap-2 text-sm">
                    <span className="w-5 shrink-0 text-right text-neutral-500">{s.stop_sequence}.</span>
                    <Dot color={s.company_color} />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.company_name}</span>
                    <span className="shrink-0 text-neutral-500">Vehicle {s.vehicle_number ?? "—"} · {STATUS[s.stop_status] ?? s.stop_status}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
