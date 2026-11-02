"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/avatar";
import { Empty, Label, Notice } from "@/components/ui";
import { LOGIN_ROLES, ROLE_LABEL } from "@/lib/roles";

export interface UserRow { id: string; name: string; email: string; phone: string | null; role: string; active: boolean; avatar: string | null }
export interface AuditRow { id: string; target_name: string | null; changed_by_name: string | null; action: string; old_role: string | null; new_role: string | null; created_at: string }

const ERR: Record<string, string> = {
  email_taken: "That email already has an account.",
  invalid_email: "Enter a valid email address.",
  invalid_password: "Password must be 8 to 72 characters.",
  invalid_name: "Enter the person's full name.",
  invalid_phone: "Enter a valid phone number (10 digits, or + and the country code).",
  invalid_role: "That role is not valid.",
  forbidden: "You are not allowed to change this account.",
  forbidden_role: "Only a super admin can give or change the Super Admin role.",
  cannot_target_self: "You cannot change your own role or deactivate yourself.",
};
const ACTION: Record<string, string> = { create: "Created", role_change: "Role changed", deactivate: "Deactivated", reactivate: "Reactivated" };

type Form = { name: string; email: string; phone: string; password: string; role: string };
const EMPTY: Form = { name: "", email: "", phone: "", password: "", role: "recruiter" };

export default function UsersManager({ initial, audit, meId, meRole, loadError }: { initial: UserRow[]; audit: AuditRow[]; meId: string; meRole: string; loadError: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "new" | string>("list"); // "new" or a user id being edited
  const [f, setF] = useState<Form>(EMPTY);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState(false);
  const [tab, setTab] = useState<"users" | "log">("users");

  // A manager can give every role except Super Admin.
  const assignable = LOGIN_ROLES.filter((r) => r !== "super_admin" || meRole === "super_admin");
  const editing = mode !== "list" && mode !== "new" ? initial.find((u) => u.id === mode) ?? null : null;

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return initial.filter((u) => (!roleFilter || u.role === roleFilter) && (!statusFilter || (statusFilter === "active") === u.active)
      && (!t || [u.name, u.email, u.phone ?? ""].join(" ").toLowerCase().includes(t)));
  }, [initial, q, roleFilter, statusFilter]);

  function suggest() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    setF((x) => ({ ...x, password: Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => chars[b % chars.length]).join("") }));
    setShow(true);
  }
  function openNew() { setMsg(null); setF(EMPTY); setShow(false); setMode("new"); }
  function openEdit(u: UserRow) { setMsg(null); setF({ name: u.name === "Unnamed" ? "" : u.name, email: u.email, phone: u.phone ?? "", password: "", role: u.role }); setShow(false); setMode(u.id); }

  async function call(method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/users", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !json?.ok) { setMsg({ ok: false, text: ERR[json?.error] ?? json?.detail ?? "Something went wrong. Try again." }); return false; }
    return true;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (await call("POST", { fullName: f.name, email: f.email, phone: f.phone, password: f.password, role: f.role })) {
      setMode("list"); setMsg({ ok: true, text: `${ROLE_LABEL[f.role]} created. Give them their email and temporary password. Their access matches their role from the first sign-in.` }); router.refresh();
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const body: Record<string, unknown> = { userId: editing.id, fullName: f.name, phone: f.phone };
    if (f.email.trim() && f.email.trim().toLowerCase() !== editing.email.toLowerCase()) body.email = f.email;
    if (f.password) body.password = f.password;
    if (f.role !== editing.role) body.role = f.role;
    if (await call("PATCH", body)) { setMode("list"); setMsg({ ok: true, text: "Saved." + (body.role ? " The new role applies the next time they open a page." : "") }); router.refresh(); }
  }
  async function setActive(u: UserRow, active: boolean) {
    if (await call("PATCH", { userId: u.id, active })) { setMsg({ ok: true, text: active ? `${u.name} reactivated.` : `${u.name} deactivated. They can no longer sign in; their history is kept.` }); router.refresh(); }
  }

  const fields = (isNew: boolean) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Label label="Full name"><input className="field" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Label>
      <Label label="Role">
        <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} disabled={!isNew && editing?.id === meId}>
          {(isNew ? assignable : editing && !assignable.includes(editing.role as never) ? [editing.role, ...assignable] : assignable).map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
        </select>
      </Label>
      <Label label="Email"><input className="field" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" /></Label>
      <Label label="Phone" hint={f.role === "driver" ? "Required for drivers (WhatsApp)." : "Optional."}>
        <input className="field" type="tel" required={f.role === "driver"} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} />
      </Label>
      <Label label={isNew ? "Temporary password" : "New password (optional)"} hint={isNew ? "At least 8 characters. Share it privately." : "Leave empty to keep the current password."}>
        <div className="flex gap-2">
          <input className="field font-mono" type={show ? "text" : "password"} required={isNew} minLength={8} maxLength={72} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
          <button type="button" className="btn-secondary shrink-0" onClick={suggest}>Generate</button>
        </div>
      </Label>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {loadError && <Notice kind="error">Could not load users. Has database update 0010 been run? ({loadError})</Notice>}
      {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}

      {mode === "new" && (
        <form onSubmit={create} className="card flex flex-col gap-4 p-4">
          <h2 className="text-base font-semibold">New user</h2>
          {fields(true)}
          <div className="flex gap-2"><button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create user"}</button><button type="button" className="btn-secondary" onClick={() => setMode("list")}>Cancel</button></div>
        </form>
      )}
      {editing && (
        <form onSubmit={save} className="card flex flex-col gap-4 p-4">
          <div className="flex items-center gap-3"><Avatar url={editing.avatar} name={editing.name} size={44} /><h2 className="text-base font-semibold">Edit {editing.name}</h2></div>
          {fields(false)}
          {editing.id === meId && <p className="text-xs text-neutral-500">You cannot change your own role.</p>}
          <div className="flex gap-2"><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button><button type="button" className="btn-secondary" onClick={() => setMode("list")}>Cancel</button></div>
        </form>
      )}

      <div className="flex gap-2 border-b border-neutral-200">
        {(["users", "log"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-brand text-brand" : "border-transparent text-neutral-500"}`}>
            {t === "users" ? `Users (${initial.length})` : "Change log"}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <>
          <div className="flex flex-wrap gap-2">
            {mode === "list" && <button className="btn-primary" onClick={openNew}>+ New user</button>}
            <input className="field min-w-[180px] flex-1" type="search" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
            <select className="field !w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
              <option value="">All roles</option>{LOGIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <select className="field !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="">Any status</option><option value="active">Active</option><option value="inactive">Deactivated</option>
            </select>
          </div>
          {shown.length === 0 ? <Empty>{initial.length === 0 ? "No users yet." : "No user matches these filters."}</Empty> : (
            <ul className="flex flex-col gap-2">
              {shown.map((u) => (
                <li key={u.id} className="card flex flex-wrap items-center gap-3 p-3">
                  <Avatar url={u.avatar} name={u.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${u.active ? "" : "text-neutral-400"}`}>
                      {u.name}{u.id === meId && <span className="ml-1 text-xs font-normal text-neutral-500">(you)</span>}
                      <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">{ROLE_LABEL[u.role] ?? u.role}</span>
                      {!u.active && <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">Deactivated</span>}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{[u.email, u.phone].filter(Boolean).join(" · ")}</p>
                  </div>
                  {(u.role !== "super_admin" || meRole === "super_admin") && (
                    <div className="flex shrink-0 gap-2">
                      <button className="btn-secondary !min-h-9 !px-3" onClick={() => openEdit(u)}>Edit</button>
                      {u.id !== meId && (u.active
                        ? <button className="btn-secondary !min-h-9 !px-3 !text-red-700" disabled={busy} onClick={() => { if (confirm(`Deactivate ${u.name}? They will no longer be able to sign in. Their history is kept and you can reactivate them later.`)) setActive(u, false); }}>Deactivate</button>
                        : <button className="btn-secondary !min-h-9 !px-3" disabled={busy} onClick={() => setActive(u, true)}>Reactivate</button>)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "log" && (audit.length === 0 ? <Empty>No changes recorded yet.</Empty> : (
        <ul className="flex flex-col gap-2">
          {audit.map((a) => (
            <li key={a.id} className="card p-3 text-sm">
              <p><span className="font-medium">{ACTION[a.action] ?? a.action}</span>: {a.target_name ?? "—"}
                {a.action === "role_change" && <span> from {ROLE_LABEL[a.old_role ?? ""] ?? a.old_role} to <b>{ROLE_LABEL[a.new_role ?? ""] ?? a.new_role}</b></span>}
                {a.action === "create" && <span> as <b>{ROLE_LABEL[a.new_role ?? ""] ?? a.new_role}</b></span>}</p>
              <p className="text-xs text-neutral-500">by {a.changed_by_name ?? "unknown"} · {new Date(a.created_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</p>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
