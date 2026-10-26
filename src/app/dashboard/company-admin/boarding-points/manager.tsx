"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Empty, Label, Notice } from "@/components/ui";

interface Row { id: string; company_id: string; name: string; address: string | null }
interface Co { id: string; name: string }

export default function BoardingPointsManager({ initial, companies, isSuper, defaultCompanyId }: { initial: Row[]; companies: Co[]; isSuper: boolean; defaultCompanyId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const coName = (id: string) => companies.find((c) => c.id === id)?.name ?? "";

  function start(r: Row | null) {
    setMsg(null);
    setEditing(r ? r.id : "new");
    setName(r?.name ?? "");
    setAddress(r?.address ?? "");
    setCompanyId(r?.company_id ?? defaultCompanyId);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) { setMsg({ ok: false, text: "Pick a company first." }); return; }
    setBusy(true);
    const payload = { name: name.trim(), address: address.trim() || null };
    const { error } = editing === "new"
      ? await supabase.from("boarding_points").insert({ ...payload, company_id: companyId })
      : await supabase.from("boarding_points").update(payload).eq("id", editing!);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setEditing(null);
    setMsg({ ok: true, text: "Boarding point saved." });
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await supabase.from("boarding_points").delete().eq("id", id);
    setBusy(false);
    setConfirm(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: "Boarding point deleted." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {companies.length === 0 && <Notice kind="info">Add a company first (Admin Centre → Companies).</Notice>}
      {editing === null && companies.length > 0 && <div><button className="btn-primary" onClick={() => start(null)}>+ Add boarding point</button></div>}
      {editing !== null && (
        <form onSubmit={save} className="card flex flex-col gap-3 p-4">
          <h2 className="text-base font-semibold">{editing === "new" ? "New boarding point" : "Edit boarding point"}</h2>
          {isSuper && editing === "new" && (
            <Label label="Company">
              <select className="field" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Label>
          )}
          <Label label="Name"><input className="field" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Label>
          <Label label="Address (optional)"><input className="field" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} /></Label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      {initial.length === 0 ? <Empty>No boarding points yet.</Empty> : (
        <ul className="flex flex-col gap-2">
          {initial.map((r) => (
            <li key={r.id} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="truncate text-xs text-neutral-500">{[isSuper ? coName(r.company_id) : null, r.address].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn-secondary !min-h-9 !px-3" onClick={() => start(r)}>Edit</button>
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
