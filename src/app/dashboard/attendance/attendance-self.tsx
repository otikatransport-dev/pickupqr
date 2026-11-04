"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Empty, Notice } from "@/components/ui";

interface Rec { id: string; work_date: string; status: string; check_in: string | null; check_out: string | null; note: string | null }
const STATUS: Record<string, string> = { present: "Present", late: "Late", absent: "Absent", leave: "On leave" };
const t = (v: string | null) => (v ? v.slice(0, 5) : "—");

export default function AttendanceSelf({ today, records }: { today: string; records: Rec[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const todays = records.find((r) => r.work_date === today);

  async function clock(out: boolean) {
    setBusy(true); setMsg(null);
    const { error } = await createClient().rpc("attendance_clock", { p_out: out });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: /not_checked_in/.test(error.message) ? "Check in first." : "Could not save. Try again." }); return; }
    setMsg({ ok: true, text: out ? "Checked out." : "Checked in." }); router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      <section className="card p-4">
        <p className="text-sm text-neutral-500">Today · {today}</p>
        <p className="mt-1 text-lg font-semibold">{todays ? STATUS[todays.status] ?? todays.status : "Not checked in"}</p>
        <p className="text-sm text-neutral-600">In {t(todays?.check_in ?? null)} · Out {t(todays?.check_out ?? null)}</p>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary" disabled={busy || !!todays?.check_in} onClick={() => clock(false)}>Check in</button>
          <button className="btn-secondary" disabled={busy || !todays?.check_in || !!todays?.check_out} onClick={() => clock(true)}>Check out</button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Something wrong? Ask Admin-HR to correct it; they keep a record of every change.</p>
      </section>
      <section>
        <h2 className="mb-2 text-base font-semibold">Recent days</h2>
        {records.length === 0 ? <Empty>No attendance recorded yet.</Empty> : (
          <ul className="flex flex-col gap-2">
            {records.map((r) => (
              <li key={r.id} className="card flex items-center gap-3 p-3 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-neutral-500">{r.work_date}</span>
                <span className="flex-1 font-medium">{STATUS[r.status] ?? r.status}</span>
                <span className="text-neutral-600">{t(r.check_in)} – {t(r.check_out)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
