"use client";

import { useState } from "react";
import { Label, Notice } from "@/components/ui";

export interface CreateUserFormProps {
  role: "driver" | "company_admin";
  companyId: string;
  companyName: string;
  onCreated: () => void;
  onCancel: () => void;
}

const ERRORS: Record<string, string> = {
  email_taken: "That email already has an account.",
  invalid_email: "Enter a valid email address.",
  invalid_password: "Password must be 8 to 72 characters.",
  invalid_name: "Enter the person's full name.",
  forbidden: "You are not allowed to create this account.",
  company_not_found: "That company no longer exists.",
};

/** Creates a login (email + temporary password) through the secure server route. */
export default function CreateUserForm({ role, companyId, companyName, onCreated, onCancel }: CreateUserFormProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function suggest() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    setPassword(Array.from(bytes, (b) => chars[b % chars.length]).join(""));
    setShow(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, fullName, phone, vehicleNumber: vehicle, role, companyId }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; detail?: string } | null;
    setBusy(false);
    if (!res.ok || !json?.ok) {
      setError(ERRORS[json?.error ?? ""] ?? json?.detail ?? "Could not create the account.");
      return;
    }
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-base font-semibold">{role === "driver" ? "Add a driver" : "Add a company admin"}</h3>
        <p className="text-xs text-neutral-500">For {companyName}. They sign in with this email and password.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label label="Full name"><input className="field" required value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} /></Label>
        <Label label="Email"><input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Label>
        <Label label="Phone" hint="Used for WhatsApp. 10 digits, or +country code.">
          <input className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
        </Label>
        {role === "driver" && (
          <Label label="Vehicle number"><input className="field" value={vehicle} onChange={(e) => setVehicle(e.target.value)} maxLength={30} /></Label>
        )}
        <Label label="Temporary password" hint="At least 8 characters. Share it with them privately.">
          <div className="flex gap-2">
            <input
              className="field font-mono"
              type={show ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button type="button" className="btn-secondary shrink-0" onClick={suggest}>Generate</button>
          </div>
        </Label>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
