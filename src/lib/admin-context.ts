import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/database.types";

export interface CompanyLite {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Shared guard + data for every Admin Centre page. Super admins see all companies; a company
 * admin only ever gets their own (Row Level Security decides, this just reads what it allows).
 */
export async function getAdminContext() {
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
  if (role !== "super_admin" && role !== "company_admin") redirect("/unauthorized");

  const { data: companies } = await supabase.from("companies").select("id, name, color").order("name");
  return {
    supabase,
    user,
    role,
    isSuper: role === "super_admin",
    companyId: me?.company_id ?? null,
    companies: (companies ?? []) as CompanyLite[],
  };
}
