"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CreateUserForm from "@/components/create-user-form";
import { Empty, Notice } from "@/components/ui";

export interface DriverRow { id: string; profileId: string; name: string; phone: string | null; optIn: boolean }

export default function DriversManager({ initial }: { initial: DriverRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
      {!adding && <div><button className="btn-primary" onClick={() => { setMsg(null); setAdding(true); }}>+ Add driver</button></div>}
      {adding && (
        <CreateUserForm role="driver" onCancel={() => setAdding(false)}
          onCreated={() => { setAdding(false); setMsg({ ok: true, text: "Driver created. Give them their email and temporary password." }); router.refresh(); }} />
      )}
      {initial.length === 0 ? <Empty>No drivers yet.</Empty> : (
        <ul className="flex flex-col gap-2">
          {initial.map((d) => (
            <li key={d.id} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{d.name}</p>
                <p className="truncate text-xs text-neutral-500">{[d.phone, d.optIn ? "WhatsApp on" : null].filter(Boolean).join(" · ")}</p>
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
