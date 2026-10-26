import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import { getBranding } from "@/lib/branding";
import Link from "next/link";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, company_id")
    .eq("id", user.id)
    .single();

  let companyName: string | null = null;
  if (profile?.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profile.company_id)
      .single();
    companyName = company?.name ?? null;
  }

  const branding = await getBranding();
  const homeHref = `/dashboard/${(profile?.role ?? "employee").replace("_", "-")}`;
  const roleLabel = profile?.role?.replace("_", " ") ?? "unknown role";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-brand text-[color:var(--on-brand)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={homeHref} aria-label={`${branding.appName} home`} className="shrink-0">
              {branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logoUrl} alt="" className="h-9 w-9 rounded-xl bg-white object-contain p-0.5" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-base font-bold text-[color:var(--on-accent)]">
                  {branding.appName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{profile?.full_name ?? user.email}</p>
              <p className="truncate text-xs capitalize opacity-75">
                {roleLabel}
                {companyName ? ` · ${companyName}` : ""}
              </p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4 pb-16">{children}</main>
    </div>
  );
}
