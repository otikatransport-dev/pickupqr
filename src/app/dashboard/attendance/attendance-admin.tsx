"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Empty, Notice } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/roles";

type Status = "present" | "late" | "absent" | "leave";
export interface Rec { id: string; status: Status; checkIn: string; checkOut: string; note: string }
export interface PersonRow { userId: string; name: string; role: string; record: Rec | null }
export interface AuditEntry { id: string; attendance_id: string; action: "create" | "update"; old_values: Record<string, string | null> | null; new_values: Record<string, string | null>; changed_by_name: string | null; changed_at: string }

const STATUS: Record<Status, string> = { present: "Present", late: "Late", absent: "Absent", leave: "On leave" };
const FIELD: Record<string, string> = { status: "Status", check_in: "Check-in", check_out: "Check-out", note: "Note" };
const show = (k: string, v: string | null) => (v == null || v === "" ? "—" : k === "status" ? STATUS[v as Status] ?? v : k.startsWith("check") ? v.slice(0, 5) : v);

export default function AttendanceAdmin({ date, rows, audit }: { date: string; rows: PersonRow[]; audit: AuditEntry[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState<string | null>(null); // userId
  const [open, setOpen] = useState<string | null>(null); // attendance id whose history is open
  const [f, setF] = useState<Rec>({ id: "", status: "present", checkIn: "", checkOut: "", note: "" });
  const [roleFilter, setRoleFilter] = useState("driver");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = rows.filter((r) => (!roleFilter || r.role === roleFilter) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())));
  const roles = [...new Set(rows.map((r) => r.role))];
  const history = (id: string) => audit.filter((a) => a.attendance_id === id);

  function edit(p: PersonRow) {
    setMsg(null); setEditing(p.userId);
    setF(p.record ?? { id: "", status: "present", checkIn: "", checkOut: "", note: "" });
  }
  async function save(userId: string) {
    if (f.checkIn && f.checkOut && f.checkOut < f.checkIn) { setMsg({ ok: false, text: "Check-out cannot be before check-in." }); return; }
    setBusy(true); setMsg(null);
    const values = { status: f.status, check_in: f.checkIn || null, check_out: f.checkOut || null, note: f.note.trim() || null };
    const { error } = f.id
      ? await supabase.from("attendance").update(values).eq("id", f.id)
      : await supabase.from("attendance").insert({ user_id: userId, work_date: date, ...values });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: /permission|row-level|policy/i.test(error.message) ? "Your role cannot edit attendance." : error.message }); return; }
    setEditing(null); setMsg({ ok: true, text: f.id ? "Record updated. The original value is kept in the history." : "Record added." }); router.refresh();
  }
  const go = (d: string) => router.push(`/dashboard/attendance?date=${d}`);

  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">Date
          <input className="field" type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} />
        </label>
        <select className="field !w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
          <option value="">Everyone</option>{roles.map((r) => <option key={r} value={r}>{(ROLE_LABEL[r] ?? r) + "s"}</option>)}
        </select>
        <input className="field min-w-[160px] flex-1" type="search" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by name" />
      </div>

      {shown.length === 0 ? <Empty>No one matches.</Empty> : (
        <ul className="flex flex-col gap-2">
          {shown.map((p) => {
            const r = p.record, h = r ? history(r.id) : [], changed = h.some((a) => a.action === "update");
            return (
              <li key={p.userId} className="card p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name} <span className="text-xs font-normal text-neutral-500">{ROLE_LABEL[p.role] ?? p.role}</span></p>
                    <p className="text-sm text-neutral-600">
                      {r ? <>{STATUS[r.status]} · In {r.checkIn || "—"} · Out {r.checkOut || "—"}{r.note && <> · <span className="italic">{r.note}</span></>}</> : <span className="text-neutral-400">No record for this day</span>}
                      {changed && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Edited</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {r && <button className="btn-secondary !min-h-9 !px-3" onClick={() => setOpen(open === r.id ? null : r.id)}>History</button>}
                    <button className="btn-secondary !min-h-9 !px-3" onClick={() => (editing === p.userId ? setEditing(null) : edit(p))}>{r ? "Edit" : "Add record"}</button>
                  </div>
                </div>

                {editing === p.userId && (
                  <form className="mt-3 grid gap-3 border-t border-neutral-200 pt-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void save(p.userId); }}>
                    <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">Status
                      <select className="field" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Status })}>
                        {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">Check-in<input className="field" type="time" value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} /></label>
                    <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">Check-out<input className="field" type="time" value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} /></label>
                    <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 sm:col-span-4">Note (why it changed)
                      <input className="field" value={f.note} maxLength={500} onChange={(e) => setF({ ...f, note: e.target.value })} />
                    </label>
                    <div className="flex gap-2 sm:col-span-4">
                      <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : f.id ? "Save change" : "Add record"}</button>
                      <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </form>
                )}

                {r && open === r.id && (
                  <ul className="mt-3 space-y-2 border-t border-neutral-200 pt-3 text-sm">
                    {h.length === 0 ? <li className="text-neutral-500">No history yet.</li> : h.map((a) => (
                      <li key={a.id}>
                        <p className="text-xs text-neutral-500">{a.action === "create" ? "Added" : "Changed"} by {a.changed_by_name ?? "unknown"} · {new Date(a.changed_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</p>
                        {a.action === "create"
                          ? <p>{Object.entries(a.new_values).filter(([, v]) => v).map(([k, v]) => `${FIELD[k]}: ${show(k, v)}`).join(" · ")}</p>
                          : <p>{Object.keys(a.new_values).filter((k) => (a.old_values?.[k] ?? null) !== (a.new_values[k] ?? null)).map((k) => (
                              <span key={k} className="mr-3 inline-block">{FIELD[k]}: <span className="text-neutral-500 line-through">{show(k, a.old_values?.[k] ?? null)}</span> → <b>{show(k, a.new_values[k])}</b></span>
                            ))}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
