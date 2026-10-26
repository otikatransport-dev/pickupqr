"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "otp-request" | "otp-verify";

export default function LoginPanel({ appName, logoUrl }: { appName: string; logoUrl: string | null }) {
  return (
    <Suspense fallback={null}>
      <LoginForm appName={appName} logoUrl={logoUrl} />
    </Suspense>
  );
}

function LoginForm({ appName, logoUrl }: { appName: string; logoUrl: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [tab, setTab] = useState<"password" | "phone">("password");
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handlePhoneRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Requires phone auth + an SMS provider (e.g. Twilio) enabled in
    // Supabase → Authentication → Providers → Phone. See README.md §3.
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo("Code sent. Check your phone.");
    setMode("otp-verify");
  }

  async function handlePhoneVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email above first.");
      return;
    }
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) setError(error.message);
    else setInfo("Password reset email sent.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-12 w-12 rounded-2xl border border-neutral-200 bg-white object-contain p-1" />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-xl font-bold text-[color:var(--on-brand)]">
            {appName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <p className="text-lg font-bold leading-tight">{appName}</p>
          <p className="text-sm text-neutral-500">PickupQR · company &amp; driver portal</p>
        </div>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>

      <div className="flex gap-1 rounded-xl bg-neutral-200/70 p-1">
        <button
          className={`flex-1 min-h-10 rounded-lg text-sm font-semibold ${tab === "password" ? "bg-white shadow-sm text-brand" : "text-neutral-500"}`}
          onClick={() => { setTab("password"); setMode("password"); setError(null); }}
        >
          Email &amp; password
        </button>
        <button
          className={`flex-1 min-h-10 rounded-lg text-sm font-semibold ${tab === "phone" ? "bg-white shadow-sm text-brand" : "text-neutral-500"}`}
          onClick={() => { setTab("phone"); setMode("otp-request"); setError(null); }}
        >
          Phone (OTP)
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

      {tab === "password" && (
        <form onSubmit={handlePasswordLogin} className="flex flex-col gap-3">
          <input
            type="email" required placeholder="you@company.com" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
          <input
            type="password" required placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
          <button disabled={loading} className="btn-primary">
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" onClick={handleForgotPassword} className="text-left text-xs text-neutral-500 underline">
            Forgot password?
          </button>
        </form>
      )}

      {tab === "phone" && mode === "otp-request" && (
        <form onSubmit={handlePhoneRequest} className="flex flex-col gap-3">
          <input
            type="tel" required placeholder="+15145551234" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="field"
          />
          <p className="text-xs text-neutral-500">Use E.164 format (country code + number, no spaces).</p>
          <button disabled={loading} className="btn-primary">
            {loading ? "Sending…" : "Send code"}
          </button>
        </form>
      )}

      {tab === "phone" && mode === "otp-verify" && (
        <form onSubmit={handlePhoneVerify} className="flex flex-col gap-3">
          <input
            type="text" inputMode="numeric" required placeholder="6-digit code" value={code}
            onChange={(e) => setCode(e.target.value)}
            className="field"
          />
          <button disabled={loading} className="btn-primary">
            {loading ? "Verifying…" : "Verify & sign in"}
          </button>
          <button type="button" onClick={() => setMode("otp-request")} className="text-left text-xs text-neutral-500 underline">
            Use a different number
          </button>
        </form>
      )}
    </main>
  );
}
