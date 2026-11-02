import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayMontreal } from "@/lib/driver-route";

/**
 * Driver Route Tracker API. Only drivers may read or save their own route (403 for everyone
 * else, 401 when signed out). The database function save_driver_route() enforces the same
 * rule again, so this check is not the only guard.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

async function driver() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: fail(401, "not_signed_in") } as const;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "driver") return { error: fail(403, "forbidden") } as const;
  return { supabase, user } as const;
}

export async function GET() {
  const d = await driver();
  if ("error" in d) return d.error;
  const { data: route } = await d.supabase.from("driver_routes").select("id, status, route_date").eq("driver_id", d.user.id).eq("route_date", todayMontreal()).maybeSingle();
  if (!route) return NextResponse.json({ ok: true, route: null, stops: [] });
  const { data: stops } = await d.supabase.from("driver_route_stops").select("company_id, vehicle_number, status, sequence").eq("route_id", route.id).order("sequence");
  return NextResponse.json({ ok: true, route, stops: stops ?? [] });
}

export async function PUT(request: Request) {
  const d = await driver();
  if ("error" in d) return d.error;
  const body = await request.json().catch(() => null);
  const list: unknown = body?.stops;
  if (!Array.isArray(list) || list.length > 60) return fail(400, "invalid_stops");
  const stops: { companyId: string; vehicleNumber: string; status: string }[] = [];
  for (const s of list) {
    if (typeof s?.companyId !== "string" || !UUID.test(s.companyId)) return fail(400, "invalid_stops");
    stops.push({ companyId: s.companyId, vehicleNumber: String(s.vehicleNumber ?? "").slice(0, 60), status: String(s.status ?? "pending") });
  }
  if (new Set(stops.map((s) => s.companyId)).size !== stops.length) return fail(400, "duplicate_company");
  const { error } = await d.supabase.rpc("save_driver_route", { p_stops: stops, p_post: body?.post === true });
  if (error) {
    const m = error.message;
    if (/vehicle_required/.test(m)) return fail(400, "vehicle_required");
    if (/invalid_vehicle/.test(m)) return fail(400, "invalid_vehicle");
    if (/company_unavailable/.test(m)) return fail(400, "company_unavailable");
    if (/forbidden/.test(m)) return fail(403, "forbidden");
    if (/does not exist|schema cache/i.test(m)) return fail(500, "migration_missing");
    return fail(400, "save_failed");
  }
  return NextResponse.json({ ok: true });
}
