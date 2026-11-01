import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import DriversManager, { type DriverRow } from "./manager";

export const metadata = { title: "Drivers" };

export default async function DriversPage() {
  const { supabase, isSuper } = await getAdminContext();
  if (!isSuper) redirect("/unauthorized");
  const [{ data }, { data: profs }] = await Promise.all([
    supabase.from("drivers").select("id, profile_id, phone, whatsapp_opt_in").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("role", "driver"),
  ]);
  const names = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
  const rows: DriverRow[] = (data ?? []).map((d) => ({ id: d.id, profileId: d.profile_id, name: names.get(d.profile_id) || "Unnamed", phone: d.phone, optIn: d.whatsapp_opt_in }));
  return (
    <div>
      <PageHeader title="Drivers" subtitle="Create driver logins. Drivers choose their company and vehicle when they plan a route." backHref="/dashboard/super-admin" />
      <DriversManager initial={rows} />
    </div>
  );
}
