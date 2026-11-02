import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import DriversManager, { type DriverRow } from "./manager";

export const metadata = { title: "Drivers" };

export default async function DriversPage() {
  const { supabase, isSuper } = await getAdminContext();
  if (!isSuper) redirect("/unauthorized");
  const [{ data }, { data: profs }] = await Promise.all([
    supabase.from("drivers").select("id, profile_id, phone, whatsapp_opt_in").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, avatar_url").eq("role", "driver"),
  ]);
  const emails = new Map<string, string>();
  try {
    const { data: users } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of users?.users ?? []) if (u.email) emails.set(u.id, u.email);
  } catch { /* emails stay blank if the service key is missing */ }
  const names = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
  const photos = new Map((profs ?? []).map((p) => [p.id, p.avatar_url]));
  const rows: DriverRow[] = (data ?? []).map((d) => ({ id: d.id, profileId: d.profile_id, name: names.get(d.profile_id) || "Unnamed", email: emails.get(d.profile_id) ?? "", avatar: photos.get(d.profile_id) ?? null, phone: d.phone, optIn: d.whatsapp_opt_in }));
  return (
    <div>
      <PageHeader title="Drivers" subtitle="Create driver logins. Drivers choose their company and vehicle when they plan a route." />
      <DriversManager initial={rows} />
    </div>
  );
}
