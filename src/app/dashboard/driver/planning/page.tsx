import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatPlanDate, todayISO } from "@/lib/planning/dates";
import { formatForDisplay } from "@/lib/phone";
import MarkViewed from "./mark-viewed";
import WhatsAppToggle from "./whatsapp-toggle";

/** Driver view: only the plannings addressed to this driver (enforced by Row Level Security). */
export default async function DriverPlanningPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, phone, whatsapp_opt_in")
    .eq("profile_id", user.id)
    .maybeSingle();

  const today = todayISO();
  const { data: rows } = driver
    ? await supabase
        .from("plannings")
        .select("*")
        .gte("plan_date", addDays(today, -7))
        .order("plan_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: [] };
  const plannings = rows ?? [];

  const signed = plannings.length
    ? await supabase.storage.from("plannings").createSignedUrls(plannings.map((p) => p.image_path), 3600)
    : { data: [] };
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  const dayName = (iso: string) => {
    if (iso === today) return "Today";
    if (iso === addDays(today, 1)) return "Tomorrow";
    return formatPlanDate(iso);
  };
  const dates = [...new Set(plannings.map((p) => p.plan_date))];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <MarkViewed ids={plannings.filter((p) => !p.viewed_at).map((p) => p.id)} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">My planning</h1>
        <Link href="/dashboard/driver" className="text-sm underline">
          Back
        </Link>
      </div>

      {!driver ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
          Your account isn&apos;t set up as a driver yet. Ask your admin.
        </p>
      ) : (
        <>
          <WhatsAppToggle initial={driver.whatsapp_opt_in} phone={driver.phone ? formatForDisplay(driver.phone) : null} />

          {dates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
              Nothing has been sent to you yet. When your admin sends your planning, it will show up here.
            </p>
          ) : (
            dates.map((date) => (
              <section key={date} className="flex flex-col gap-3">
                <h2 className="font-semibold">
                  {dayName(date)}
                  <span className="ml-2 text-sm font-normal text-neutral-500">
                    {date === today || date === addDays(today, 1) ? formatPlanDate(date) : ""}
                  </span>
                </h2>
                {plannings
                  .filter((p) => p.plan_date === date)
                  .map((p, i) => {
                    const url = urlByPath.get(p.image_path);
                    return (
                      <article key={p.id} className="overflow-hidden card">
                        {(p.shift_label || p.notice || i > 0) && (
                          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2 text-sm">
                            {i > 0 && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">Earlier version</span>}
                            {p.shift_label && <span className="font-medium">{p.shift_label}</span>}
                            {p.notice && <span className="text-neutral-600">{p.notice}</span>}
                          </div>
                        )}
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open planning full size">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Planning for ${formatPlanDate(date)}`} className="w-full" />
                          </a>
                        ) : (
                          <p className="p-4 text-sm text-neutral-500">The image could not be loaded. Pull to refresh.</p>
                        )}
                      </article>
                    );
                  })}
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
