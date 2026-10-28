"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Form() {
  const router = useRouter();
  const welcome = useSearchParams().get("welcome") === "1";
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => router.push("/dashboard"), 1200);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">{welcome ? "Welcome! Create your password" : "Set a new password"}</h1>
      {signedIn === false ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This link has expired or was already used. Ask your admin to send a new invitation, or use “Forgot password” on the sign-in page.
        </p>
      ) : done ? (
        <p className="text-sm text-emerald-700">Password saved. Taking you to your dashboard…</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <input type="password" required minLength={8} placeholder="New password (8+ characters)" value={password}
            onChange={(e) => setPassword(e.target.value)} className="field" autoComplete="new-password" />
          <input type="password" required minLength={8} placeholder="Repeat password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className="field" autoComplete="new-password" />
          <button className="btn-primary" disabled={signedIn === null}>Save password</button>
        </form>
      )}
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><Form /></Suspense>;
}
