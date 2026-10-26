"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CreateUserForm from "@/components/create-user-form";
import { Empty, Label, Notice } from "@/components/ui";

export interface DriverRow { id: string; profileId: string; companyId: string | null; name: string; vehicle: string | null; phone: string | null; optIn: boolean }
interface Co { id: string; name: string }

export default function DriversManager({ initial, companies, isSuper, defaultCompanyId }: { initial: DriverRow[]; companies: Co[]; isSuper: boolean; defaultCompanyId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const co = companies.find((c) => c.id === companyId);
  const coName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "";

  async function remove(profileId: string) {
    setBusy(true);
    const res = await fetch("/api/admin/users", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: profileId }) });
    setBusy(false);
    setConfirm(null);
    setMsg(res.ok ? { ok: true, text: "Driver removed." } : { ok: false, text: "Could not remove that driver." });
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      {companies.length === 0 && <Notice kind="info">Add a company first (Admin Centre → Companies).</Notice>}
      {!adding && companies.length > 0 && <div><button className="btn-primary" onClick={() => { setMsg(null); setAdding(true); }}>+ Add driver</button></div>}
      {adding && co && (
        <div className="flex flex-col gap-3">
          {isSuper && (
            <Label label="Company">
              <select className="field" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Label>
          )}
          <CreateUserForm key={co.id} role="driver" companyId={co.id} companyName={co.name} onCancel={() => setAdding(false)}
            onCreated={() => { setAdding(false); setMsg({ ok: true, text: "Driver created. Give them their email and temporary password." }); router.refresh(); }} />
        </div>
      )}
      {initial.length === 0 ? <Empty>No drivers yet.</Empty> : (
        <ul className="flex flex-col gap-2">
          {initial.map((d) => (
            <li key={d.id} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{d.name}</p>
                <p className="truncate text-xs text-neutral-500">
                  {[isSuper ? coName(d.companyId) : null, d.vehicle && `Vehicle ${d.vehicle}`, d.phone, d.optIn ? "WhatsApp on" : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              {confirm === d.id
                ? <button className="btn !min-h-9 !px-3 bg-red-600 text-white" disabled={busy} onClick={() => remove(d.profileId)}>Confirm remove</button>
                : <button className="btn-secondary !min-h-9 !px-3 !text-red-700" onClick={() => setConfirm(d.id)}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
