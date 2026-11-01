import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Database } from "@/lib/database.types";

export type AdminCaller =
  | { ok: false; status: 401 | 403; error: string }
  | { ok: true; supabase: SupabaseClient<Database>; user: User; role: AppRole; isSuper: boolean; companyId: string | null };

/** Who is calling an admin API route: a signed-in super admin or company admin, or a failure to report. */
export async function getAdminCaller(): Promise<AdminCaller> {
  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "not_signed_in" };
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (me?.role !== "super_admin" && me?.role !== "company_admin") return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, supabase, user, role: me.role as AppRole, isSuper: me.role === "super_admin", companyId: me.company_id as string | null };
}
