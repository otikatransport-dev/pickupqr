"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toWhatsAppNumber } from "@/lib/phone";
import { Empty, Label, Notice } from "@/components/ui";

interface Row { id: string; name: string; phone_normalized: string; company_id: string | null; active: boolean }
interface Co { id: string; name: string }

export default function EmployeesManager({ initial, companies, isSuper, defaultCompanyId }: { initial: Row[]; companies: Co[]; isSuper: boolean; defaultCompanyId: string }) {
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
    setMsg({ ok: true, text: "Employee deleted." });
    router.refresh();
  }

  const shown = initial.filter((r) => !q.trim() || `${r.name} ${r.phone_normalized}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {editing === null && (
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => start(null)}>+ Add employee</button>
          <input className="field flex-1" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
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
            <li key={r.id} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className={`truncate font-medium ${r.active ? "" : "text-neutral-400 line-through"}`}>{r.name}</p>
                <p className="truncate text-xs text-neutral-500">{[r.phone_normalized, isSuper ? coName(r.company_id) : null, r.active ? null : "Inactive"].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn-secondary !min-h-9 !px-3" onClick={() => start(r)}>Edit</button>
                <button className="btn-secondary !min-h-9 !px-3" onClick={() => toggle(r)}>{r.active ? "Deactivate" : "Activate"}</button>
                {confirm === r.id
                  ? <button className="btn !min-h-9 !px-3 bg-red-600 text-white" disabled={busy} onClick={() => remove(r.id)}>Confirm</button>
                  : <button className="btn-secondary !min-h-9 !px-3 !text-red-700" onClick={() => setConfirm(r.id)}>Delete</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
