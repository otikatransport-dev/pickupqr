"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isHexColor } from "@/lib/branding";
import ColorInput from "@/components/color-input";
import CreateUserForm from "@/components/create-user-form";
import { Dot, Empty, Label, Notice } from "@/components/ui";

export interface CompanyRow {
  id: string; name: string; color: string | null; logo_url: string | null; address: string | null;
  drivers: number; boardingPoints: number; employees: number;
}
export interface AdminRow { id: string; name: string; phone: string | null; companyId: string | null }

const NEW = "__new__";
const SWATCHES = ["#1a73e8", "#e8710a", "#188038", "#d93025", "#9334e6", "#00796b", "#f9ab00", "#5f6368"];

export default function CompaniesManager({ initial, admins }: { initial: CompanyRow[]; admins: AdminRow[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null); // company id, NEW, or null
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [address, setAddress] = useState("");
  const [logo, setLogo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [addAdminFor, setAddAdminFor] = useState<string | null>(null);
  const [confirmRemoveAdmin, setConfirmRemoveAdmin] = useState<string | null>(null);

  function startEdit(c: CompanyRow | null) {
    setMsg(null);
    setEditing(c ? c.id : NEW);
    setName(c?.name ?? "");
    setColor(c?.color && isHexColor(c.color) ? c.color : SWATCHES[(initial.length) % SWATCHES.length]);
    setAddress(c?.address ?? "");
    setLogo(c?.logo_url ?? "");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !isHexColor(color)) return;
    setBusy(true);
    setMsg(null);
    const payload = { name: name.trim(), color: color.toLowerCase(), address: address.trim() || null, logo_url: logo.trim() || null };
    const { error } = editing === NEW
      ? await supabase.from("companies").insert(payload)
      : await supabase.from("companies").update(payload).eq("id", editing!);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setEditing(null);
    setMsg({ ok: true, text: "Company saved." });
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await supabase.from("companies").delete().eq("id", id);
    setBusy(false);
    setConfirmDelete(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: "Company deleted, together with its boarding points and routes." });
    router.refresh();
  }

  async function removeAdmin(id: string) {
    setBusy(true);
    const res = await fetch("/api/admin/users", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: id }) });
    setBusy(false);
    setConfirmRemoveAdmin(null);
    setMsg(res.ok ? { ok: true, text: "Admin login removed." } : { ok: false, text: "Could not remove that admin." });
    if (res.ok) router.refresh();
  }

  const addAdminCompany = initial.find((c) => c.id === addAdminFor);

  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}

      {editing === null && (
        <div><button className="btn-primary" onClick={() => startEdit(null)}>+ Add company</button></div>
      )}

      {editing !== null && (
        <form onSubmit={save} className="card flex flex-col gap-4 p-4">
          <h2 className="text-base font-semibold">{editing === NEW ? "New company" : "Edit company"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label label="Company name"><input className="field" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Label>
            <Label label="Address (optional)"><input className="field" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} /></Label>
          </div>
          <Label label="Button colour" hint="Drivers see this company as a button in this colour.">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((s) => (
                  <button key={s} type="button" aria-label={`Use ${s}`} onClick={() => setColor(s)}
                    className={`h-8 w-8 rounded-full border-2 ${color.toLowerCase() === s ? "border-neutral-900" : "border-transparent"}`} style={{ background: s }} />
                ))}
              </div>
              <ColorInput label="Company colour" value={color} onChange={setColor} />
            </div>
          </Label>
          <Label label="Logo link (optional)" hint="Paste the web address of an image.">
            <input className="field" type="url" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…" />
          </Label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy || !name.trim() || !isHexColor(color)}>{busy ? "Saving…" : "Save company"}</button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {addAdminCompany && (
        <CreateUserForm
          role="company_admin"
          companyId={addAdminCompany.id}
          companyName={addAdminCompany.name}
          onCancel={() => setAddAdminFor(null)}
          onCreated={() => { setAddAdminFor(null); setMsg({ ok: true, text: "Company admin created. Give them their email and temporary password." }); router.refresh(); }}
        />
      )}

      {initial.length === 0 ? (
        <Empty>No companies yet. Add your first one to get started.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {initial.map((c) => {
            const cAdmins = admins.filter((a) => a.companyId === c.id);
            return (
              <li key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-base font-semibold"><Dot color={c.color} /> <span className="truncate">{c.name}</span></p>
                    {c.address && <p className="mt-0.5 text-sm text-neutral-500">{c.address}</p>}
                    <p className="mt-1 text-xs text-neutral-500">
                      {c.drivers} drivers · {c.boardingPoints} boarding points · {c.employees} employees
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button className="btn-secondary !min-h-9 !px-3" onClick={() => startEdit(c)}>Edit</button>
                    {confirmDelete === c.id ? (
                      <button className="btn !min-h-9 !px-3 bg-red-600 text-white" disabled={busy} onClick={() => remove(c.id)}>Confirm delete</button>
                    ) : (
                      <button className="btn-secondary !min-h-9 !px-3 !text-red-700" onClick={() => setConfirmDelete(c.id)}>Delete</button>
                    )}
                  </div>
                </div>
                <div className="mt-3 border-t border-neutral-200 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-neutral-700">Company admins</p>
                    <button className="text-sm font-medium text-brand hover:underline" onClick={() => { setMsg(null); setAddAdminFor(c.id); }}>+ Add admin</button>
                  </div>
                  {cAdmins.length === 0 ? (
                    <p className="mt-1 text-sm text-neutral-500">No admin yet, so nobody can manage this company except you.</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {cAdmins.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                          <span>{a.name}{a.phone ? <span className="text-neutral-500"> · {a.phone}</span> : null}</span>
                          {confirmRemoveAdmin === a.id ? (
                            <button className="text-red-700 underline" disabled={busy} onClick={() => removeAdmin(a.id)}>Confirm remove</button>
                          ) : (
                            <button className="text-neutral-500 underline" onClick={() => setConfirmRemoveAdmin(a.id)}>Remove</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
