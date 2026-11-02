import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, type Capability } from "@/lib/roles";
import type { AppRole } from "@/lib/database.types";

export interface CompanyLite {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Shared guard + data for every Admin Centre page. Pass the capability the page needs; anyone
 * without it is sent to /unauthorized. Every role that can open an Admin Centre page sees all
 * companies (Row Level Security still decides what each role may read or change).
 * `isSuper` is therefore always true here: it means "not limited to one company".
 * `canEdit` says whether this role may change things on the page (recruiters only view).
 */
export async function getAdminContext(cap: Capability = "staff_hub", editCap?: Capability) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role, company_id, full_name")
    .eq("id", user.id)
    .single();
  const role = me?.role as AppRole | undefined;
  if (!can(role, cap)) redirect("/unauthorized");

  const { data: companies } = await supabase.from("companies").select("id, name, color").eq("status", "active").order("name");
  return {
    supabase,
    user,
    role,
    isSuper: true,
    canEdit: editCap ? can(role, editCap) : true,
    companyId: me?.company_id ?? null,
    companies: (companies ?? []) as CompanyLite[],
  };
}
