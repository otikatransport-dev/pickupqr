import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayISO } from "@/lib/planning/dates";
import { getWhatsAppConfig } from "@/lib/whatsapp";
import PlanningAdmin, { type DriverRow, type PlanningRow } from "./planning-admin";

/**
 * Admin Planning page. Reachable by company admins (their own drivers only) and super
 * admins (everyone). What each can see is decided by Row Level Security, not by this page.
 */
export default async function PlanningPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "super_admin" && me?.role !== "company_admin") redirect("/unauthorized");

  const today = todayISO();

  const { data: driverRows } = await supabase
    .from("drivers")
    .select("id, profile_id, vehicle_number, phone, whatsapp_opt_in")
    .order("created_at");
  const profileIds = (driverRows ?? []).map((d) => d.profile_id);
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, full_name, phone").in("id", profileIds)
    : { data: [] };
  const byProfile = new Map((profiles ?? []).map((p) => [p.id, p]));

  const drivers: DriverRow[] = (driverRows ?? [])
    .map((d) => {
      const prof = byProfile.get(d.profile_id);
      return {
        id: d.id,
        name: prof?.full_name || "Unnamed driver",
        phone: d.phone || prof?.phone || null,
        vehicle: d.vehicle_number,
        optIn: d.whatsapp_opt_in,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // last two weeks plus anything planned ahead
  const { data: planRows } = await supabase
    .from("plannings")
    .select("*")
    .gte("plan_date", addDays(today, -14))
    .order("created_at", { ascending: false })
    .limit(500);

  // private bucket: hand the browser short-lived links (1 hour) for the thumbnails
  const paths = (planRows ?? []).map((p) => p.image_path);
  const signed = paths.length ? await supabase.storage.from("plannings").createSignedUrls(paths, 3600) : { data: [] };
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  const plannings: PlanningRow[] = (planRows ?? []).map((p) => ({
    id: p.id,
    driverId: p.driver_id,
    planDate: p.plan_date,
    shiftLabel: p.shift_label,
    createdAt: p.created_at,
    viewedAt: p.viewed_at,
    waStatus: p.whatsapp_status,
    waError: p.whatsapp_error,
    url: urlByPath.get(p.image_path) ?? null,
  }));

  return (
    <PlanningAdmin
      drivers={drivers}
      plannings={plannings}
      defaultDate={addDays(today, 1)}
      whatsappReady={getWhatsAppConfig() !== null}
      userId={user.id}
    />
  );
}
