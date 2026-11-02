import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/roles";

export default async function DashboardIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  redirect(homeFor(profile?.role));
}
