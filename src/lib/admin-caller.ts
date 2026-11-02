import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { can, type Capability } from "@/lib/roles";
import type { AppRole, Database } from "@/lib/database.types";

export type AdminCaller =
  | { ok: false; status: 401 | 403; error: string }
  | { ok: true; supabase: SupabaseClient<Database>; user: User; role: AppRole; isSuper: boolean; companyId: string | null };

/**
 * Who is calling an admin API route. Fails with 401 when signed out and 403 when the role lacks the
 * capability. `isSuper` is true for every role allowed in (none is limited to one company any more).
 */
export async function getAdminCaller(cap: Capability = "employees_edit"): Promise<AdminCaller> {
  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "not_signed_in" };
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (!can(me?.role, cap)) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, supabase, user, role: me!.role as AppRole, isSuper: true, companyId: (me!.company_id as string | null) ?? null };
}
