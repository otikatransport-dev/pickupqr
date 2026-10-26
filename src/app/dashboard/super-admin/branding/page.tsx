import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBranding } from "@/lib/branding";
import { PageHeader } from "@/components/ui";
import BrandingForm from "./branding-form";

export const metadata = { title: "Branding" };

export default async function BrandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "super_admin") redirect("/unauthorized");

  const branding = await getBranding();
  return (
    <div>
      <PageHeader
        title="Branding"
        subtitle="Name, colours and logo used on every screen, including the login page."
        backHref="/dashboard/super-admin"
      />
      <BrandingForm initial={branding} userId={user.id} />
    </div>
  );
}
