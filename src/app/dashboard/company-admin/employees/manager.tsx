"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toWhatsAppNumber } from "@/lib/phone";
import { Empty, Label, Notice } from "@/components/ui";
import QrCardsModal, { type QrPerson } from "@/components/qr-cards-modal";

interface Row { id: string; name: string; phone_normalized: string; company_id: string | null; active: boolean; qr_token: string; qr_generated_at: string | null }
interface Co { id: string; name: string }

export default function EmployeesManager({ initial, companies, isSuper, defaultCompanyId, readOnly = false }: { initial: Row[]; companies: Co[]; isSuper: boolean; defaultCompanyId: string; readOnly?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [qrView, setQrView] = useState<QrPerson[] | null>(null);
  const coName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "";

  function start(r: Row | null) {
    setMsg(null);
    setEditing(r ? r.id : "new");
    setName(r?.name ?? "");
    setPhone(r?.phone_normalized ?? "");
    setCompanyId(r?.company_id ?? defaultCompanyId);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const digits = toWhatsAppNumber(phone);
    const e164 = digits ? `+${digits}` : null;
    if (!e164) { setMsg({ ok: false, text: "Enter a valid phone number (10 digits, or start with + and the country code)." }); return; }
    setBusy(true);
    setMsg(null);
    const { error } = editing === "new"
      ? await supabase.from("employees").insert({ name: name.trim(), phone_normalized: e164, company_id: companyId || null })
      : await supabase.from("employees").update({ name: name.trim(), company_id: companyId || null }).eq("id", editing!);
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.code === "23505" ? "An employee with this name and phone already exists." : error.message });
      return;
    }
    setEditing(null);
    setMsg({ ok: true, text: "Employee saved." });
    router.refresh();
  }

  async function toggle(r: Row) {
    const { error } = await supabase.from("employees").update({ active: !r.active }).eq("id", r.id);
    if (error) setMsg({ ok: false, text: error.message }); else router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await supabase.from("employees").delete().eq("id", id);
    setBusy(false);
    setConfirm(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setPicked((p) => { const n = new Set(p); n.delete(id); return n; });
    setMsg({ ok: true, text: "Employee deleted." });
    router.refresh();
  }

  const shown = useMemo(() => initial.filter((r) => !q.trim() || `${r.name} ${r.phone_normalized}`.toLowerCase().includes(q.trim().toLowerCase())), [initial, q]);
  const shownIds = shown.map((r) => r.id);
  const allPicked = shown.length > 0 && shownIds.every((id) => picked.has(id));
  const pickedRows = initial.filter((r) => picked.has(r.id));
  const toGenerate = pickedRows.filter((r) => !r.qr_generated_at);
  const missingAll = initial.filter((r) => !r.qr_generated_at);
  const person = (r: Row): QrPerson => ({ id: r.id, name: r.name, company: coName(r.company_id), token: r.qr_token });

  function toggleAll() {
    setPicked((p) => {
      const n = new Set(p);
      if (allPicked) shownIds.forEach((id) => n.delete(id)); else shownIds.forEach((id) => n.add(id));
      return n;
    });
  }
  function toggleOne(id: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  /** Marks QR codes as generated. The code itself comes from each employee's permanent unique token, so it can never be duplicated. */
  async function generate(rows: Row[]) {
    if (!rows.length) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.from("employees").update({ qr_generated_at: new Date().toISOString() })
      .in("id", rows.map((r) => r.id)).is("qr_generated_at", null).select("id");
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message.includes("qr_generated_at") ? "Run the 0005 database update first (see instructions)." : error.message }); return; }
    setMsg({ ok: true, text: `${data?.length ?? 0} QR code${data?.length === 1 ? "" : "s"} generated.` });
    router.refresh();
  }

  const viewPicked = pickedRows.filter((r) => r.qr_generated_at);

  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {editing === null && (
        <>
          <div className="flex flex-wrap gap-2">
            {!readOnly && <button className="btn-primary" onClick={() => start(null)}>+ Add employee</button>}
            <input className="field min-w-[200px] flex-1" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="card flex flex-wrap items-center gap-2 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select all employees in the list" /> Select all
            </label>
            <span className="text-sm text-neutral-500">{picked.size} selected</span>
            <span className="flex-1" />
            {!readOnly && (
              <>
                <button className="btn-primary !min-h-9 !px-3" disabled={busy || toGenerate.length === 0} onClick={() => generate(toGenerate)}
                  title={picked.size === 0 ? "Tick the employees first" : undefined}>
                  Generate QR code{toGenerate.length > 1 ? `s (${toGenerate.length})` : ""}
                </button>
                <button className="btn-secondary !min-h-9 !px-3" disabled={busy || missingAll.length === 0} onClick={() => generate(missingAll)}>
                  Generate for all without one ({missingAll.length})
                </button>
              </>
            )}
            <button className="btn-secondary !min-h-9 !px-3" disabled={viewPicked.length === 0} onClick={() => setQrView(viewPicked.map(person))}>
              🖨 View / print selected ({viewPicked.length})
            </button>
          </div>
        </>
      )}
      {editing !== null && (
        <form onSubmit={save} className="card flex flex-col gap-3 p-4">
          <h2 className="text-base font-semibold">{editing === "new" ? "New employee" : "Edit employee"}</h2>
          <Label label="Full name"><input className="field" required value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></Label>
          <Label label="Phone" hint={editing === "new" ? "Used to identify them. Cannot be changed later." : "The phone number cannot be changed."}>
            <input className="field" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} disabled={editing !== "new"} />
          </Label>
          {isSuper && (
            <Label label="Company">
              <select className="field" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">No company</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Label>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      {shown.length === 0 ? <Empty>{initial.length === 0 ? "No employees yet." : "No match."}</Empty> : (
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <li key={r.id} className={`card flex items-center gap-3 p-3 ${picked.has(r.id) ? "ring-2 ring-brand" : ""}`}>
              <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={"Select " + r.name} className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${r.active ? "" : "text-neutral-400 line-through"}`}>{r.name}</p>
                <p className="truncate text-xs text-neutral-500">
                  {[r.phone_normalized, isSuper ? coName(r.company_id) : null, r.active ? null : "Inactive"].filter(Boolean).join(" · ")}
                  {r.qr_generated_at ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">QR ready</span> : <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">No QR yet</span>}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {!readOnly && <button className="btn-secondary !min-h-9 !px-3" onClick={() => start(r)}>Edit</button>}
                {r.qr_generated_at && (
                  <button className="btn-secondary !min-h-9 !px-3" title="View QR code" aria-label={"View QR code for " + r.name} onClick={() => setQrView([person(r)])}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                )}
                {!readOnly && <button className="btn-secondary !min-h-9 !px-3" onClick={() => toggle(r)}>{r.active ? "Deactivate" : "Activate"}</button>}
                {!readOnly && (confirm === r.id
                  ? <button className="btn !min-h-9 !px-3 bg-red-600 text-white" disabled={busy} onClick={() => remove(r.id)}>Confirm</button>
                  : <button className="btn-secondary !min-h-9 !px-3 !text-red-700" onClick={() => setConfirm(r.id)}>Delete</button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {qrView && <QrCardsModal people={qrView} onClose={() => setQrView(null)} />}
    </div>
  );
}
