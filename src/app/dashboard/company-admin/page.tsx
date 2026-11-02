import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { can, ROLE_LABEL } from "@/lib/roles";

export const metadata = { title: "Admin Centre" };

/** Home for Admin-HR and recruiters: the same tiles as the Admin Centre, limited to what their role allows. */
export default async function StaffHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const tiles = ADMIN_NAV.filter((i) => can(me?.role, i.cap));

  return (
    <div>
      <PageHeader title="Admin Centre" subtitle={`Signed in as ${ROLE_LABEL[me?.role ?? ""] ?? "staff"}. You see the screens your role allows.`} />
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((i) => (
          <Link key={i.href} href={i.href} className="card-link">
            <p className="font-medium">{i.title}</p>
            <p className="text-sm text-neutral-500">{i.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
