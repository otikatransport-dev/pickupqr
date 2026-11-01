"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CreateUserForm from "@/components/create-user-form";
import Avatar from "@/components/avatar";
import { Empty, Label, Notice } from "@/components/ui";

export interface DriverRow { id: string; profileId: string; name: string; email: string; avatar: string | null; phone: string | null; optIn: boolean }

const ERR: Record<string, string> = {
  email_taken: "That email already has an account.",
  invalid_email: "Enter a valid email address.",
  invalid_password: "Password must be 8 to 72 characters.",
  invalid_name: "Enter the driver's full name.",
  invalid_phone: "Enter a valid phone number (10 digits, or + and the country code).",
};

export default function DriversManager({ initial }: { initial: DriverRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [edit, setEdit] = useState<DriverRow | null>(null);
  const [f, setF] = useState({ name: "", phone: "", email: "", password: "" });

  function startEdit(d: DriverRow) {
    setMsg(null); setAdding(false); setEdit(d);
    setF({ name: d.name === "Unnamed" ? "" : d.name, phone: d.phone ?? "", email: d.email, password: "" });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true); setMsg(null);
    const body: Record<string, string> = { userId: edit.profileId, fullName: f.name, phone: f.phone };
    if (f.email.trim() && f.email.trim().toLowerCase() !== edit.email.toLowerCase()) body.email = f.email;
    if (f.password) body.password = f.password;
    const res = await fetch("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !json?.ok) { setMsg({ ok: false, text: ERR[json?.error] ?? json?.detail ?? "Could not save the changes." }); return; }
    setEdit(null); setMsg({ ok: true, text: "Driver updated." }); router.refresh();
  }

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
      {!adding && !edit && <div><button className="btn-primary" onClick={() => { setMsg(null); setAdding(true); }}>+ Add driver</button></div>}
      {adding && (
        <CreateUserForm role="driver" onCancel={() => setAdding(false)}
          onCreated={() => { setAdding(false); setMsg({ ok: true, text: "Driver created. Give them their email and temporary password." }); router.refresh(); }} />
      )}
      {edit && (
        <form onSubmit={saveEdit} className="card flex flex-col gap-4 p-4">
          <div className="flex items-center gap-3">
            <Avatar url={edit.avatar} name={edit.name} size={48} />
            <div><h3 className="text-base font-semibold">Edit driver</h3><p className="text-xs text-neutral-500">The driver adds or changes their own photo from their login.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label label="Full name"><input className="field" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Label>
            <Label label="Phone" hint="Used for WhatsApp."><input className="field" type="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} /></Label>
            <Label label="Email" hint="Changing it changes the address they sign in with."><input className="field" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" /></Label>
            <Label label="New password (optional)" hint="Leave empty to keep the current password."><input className="field font-mono" type="text" minLength={8} maxLength={72} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Label>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
            <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      )}
      {initial.length === 0 ? <Empty>No drivers yet.</Empty> : (
        <ul className="flex flex-col gap-2">
          {initial.map((d) => (
            <li key={d.id} className="card flex items-center gap-3 p-3">
              <Avatar url={d.avatar} name={d.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.name}</p>
                <p className="truncate text-xs text-neutral-500">{[d.phone, d.email, d.optIn ? "WhatsApp on" : null].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="btn-secondary !min-h-9 !px-3" onClick={() => startEdit(d)}>Edit</button>
                {confirm === d.id
                  ? <button className="btn !min-h-9 !px-3 bg-red-600 text-white" disabled={busy} onClick={() => remove(d.profileId)}>Confirm remove</button>
                  : <button className="btn-secondary !min-h-9 !px-3 !text-red-700" onClick={() => setConfirm(d.id)}>Remove</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
