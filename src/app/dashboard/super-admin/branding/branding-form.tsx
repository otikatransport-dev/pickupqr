"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_BRANDING, isHexColor, readableTextOn, type Branding } from "@/lib/branding";
import ColorInput from "@/components/color-input";
import { Label, Notice } from "@/components/ui";

const PRESETS: Array<{ name: string; brand: string; accent: string }> = [
  { name: "Navy & amber", brand: "#12284c", accent: "#f2a31b" },
  { name: "Forest", brand: "#14532d", accent: "#facc15" },
  { name: "Crimson", brand: "#9f1239", accent: "#fbbf24" },
  { name: "Slate", brand: "#1e293b", accent: "#38bdf8" },
  { name: "Teal", brand: "#0f766e", accent: "#fb923c" },
  { name: "Purple", brand: "#4c1d95", accent: "#a3e635" },
];

const MAX_LOGO_BYTES = 1024 * 1024;

export default function BrandingForm({ initial, userId }: { initial: Branding; userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [appName, setAppName] = useState(initial.appName);
  const [brand, setBrand] = useState(initial.brandColor);
  const [accent, setAccent] = useState(initial.accentColor);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const brandOk = isHexColor(brand);
  const accentOk = isHexColor(accent);
  const nameOk = appName.trim().length >= 1 && appName.trim().length <= 60;
  const canSave = brandOk && accentOk && nameOk && !busy;
  const dirty =
    appName.trim() !== initial.appName || brand.toLowerCase() !== initial.brandColor.toLowerCase() ||
    accent.toLowerCase() !== initial.accentColor.toLowerCase() || logoUrl !== initial.logoUrl;

  const previewVars = {
    "--brand-base": brandOk ? brand : DEFAULT_BRANDING.brandColor,
    "--brand": brandOk ? brand : DEFAULT_BRANDING.brandColor,
    "--accent": accentOk ? accent : DEFAULT_BRANDING.accentColor,
    "--on-brand": readableTextOn(brandOk ? brand : DEFAULT_BRANDING.brandColor),
    "--on-accent": readableTextOn(accentOk ? accent : DEFAULT_BRANDING.accentColor),
  } as React.CSSProperties;

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      setMsg({ ok: false, text: "Logo must be a PNG, JPG, WebP or SVG image." });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setMsg({ ok: false, text: "Logo must be under 1 MB." });
      return;
    }
    setBusy(true);
    const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: `Upload failed: ${error.message}` });
      return;
    }
    setLogoUrl(supabase.storage.from("branding").getPublicUrl(path).data.publicUrl);
    setMsg({ ok: true, text: "Logo uploaded. Press Save to use it everywhere." });
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase
      .from("app_settings")
      .update({
        app_name: appName.trim(),
        brand_color: brand.toLowerCase(),
        accent_color: accent.toLowerCase(),
        logo_url: logoUrl,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("id");
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else if (!data || data.length === 0) {
      setMsg({
        ok: false,
        text: "Nothing was saved. Make sure the 0003_admin_centre.sql database update has been run and that you are signed in as a super admin.",
      });
    } else {
      setMsg({ ok: true, text: "Saved. The new look is live for everyone." });
      router.refresh();
    }
  }

  function reset() {
    setAppName(DEFAULT_BRANDING.appName);
    setBrand(DEFAULT_BRANDING.brandColor);
    setAccent(DEFAULT_BRANDING.accentColor);
    setLogoUrl(null);
    setMsg(null);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card flex flex-col gap-5 p-5">
        <Label label="App name" hint="Shown in the header, the login page and the browser tab.">
          <input className="field" value={appName} maxLength={60} onChange={(e) => setAppName(e.target.value)} />
        </Label>

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700">Quick colour sets</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => { setBrand(p.brand); setAccent(p.accent); }}
                className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-50"
              >
                <span className="flex">
                  <span className="h-5 w-5 rounded-l-full" style={{ background: p.brand }} />
                  <span className="h-5 w-5 rounded-r-full" style={{ background: p.accent }} />
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <Label label="Main colour" hint="Header, buttons and links.">
          <ColorInput label="Main colour" value={brand} onChange={setBrand} />
        </Label>
        <Label label="Accent colour" hint="Highlights, such as the logo badge.">
          <ColorInput label="Accent colour" value={accent} onChange={setAccent} />
        </Label>

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700">Logo</p>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Current logo" className="h-14 w-14 rounded-xl border border-neutral-200 bg-white object-contain p-1" />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-xl border border-dashed border-neutral-300 text-xs text-neutral-500">none</span>
            )}
            <label className="btn-secondary cursor-pointer">
              Upload logo
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </label>
            {logoUrl && (
              <button type="button" className="text-sm text-neutral-500 underline" onClick={() => setLogoUrl(null)}>
                Remove
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">PNG, JPG, WebP or SVG, up to 1 MB. A square image works best.</p>
        </div>

        {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={!canSave || !dirty} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={reset}>
            Reset to Otika default
          </button>
        </div>
      </section>

      <section aria-label="Live preview" className="flex flex-col gap-3">
        <p className="text-sm font-medium text-neutral-700">Live preview</p>
        <div style={previewVars} className="overflow-hidden rounded-2xl border border-neutral-200 bg-[#f4f6fa] text-[#101828] shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-9 w-9 rounded-xl bg-white object-contain p-0.5" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-xl text-base font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                {(appName.trim() || "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-sm font-semibold leading-tight">{appName.trim() || "App name"}</p>
              <p className="text-xs opacity-75">Super admin</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <p className="text-lg font-bold">Good morning</p>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-3xl font-bold" style={{ color: "var(--brand)" }}>12</p>
              <p className="text-xs text-neutral-500">Drivers</p>
            </div>
            <div className="flex gap-2">
              <span className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold" style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
                Primary button
              </span>
              <span className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                Accent
              </span>
            </div>
          </div>
        </div>
        {!brandOk || !accentOk ? <Notice kind="info">Enter full 6-digit colours to see them here.</Notice> : null}
      </section>
    </div>
  );
}
