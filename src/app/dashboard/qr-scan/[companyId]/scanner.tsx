"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { createClient } from "@/lib/supabase/client";
import { Empty } from "@/components/ui";
import { tokenFromScan } from "@/lib/qr";

interface Scan { id: string; employee_name: string; scanned_at: string; scanned_by_name: string; other_company: boolean }
type Outcome =
  | { kind: "ok" | "warn" | "bad"; title: string; detail?: string };

const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Scanner({ companyId, initialScans }: { companyId: string; initialScans: Scan[] }) {
  const supabase = useRef(createClient()).current;
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const last = useRef({ token: "", at: 0 });
  const busy = useRef(false);
  const [camera, setCamera] = useState<"off" | "starting" | "on">("off");
  const [camError, setCamError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [scans, setScans] = useState<Scan[]>(initialScans);
  const [manual, setManual] = useState("");

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera("off");
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const submit = useCallback(async (token: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { data, error } = await supabase.rpc("record_qr_scan", { p_company: companyId, p_token: token });
      if (error) { setOutcome({ kind: "bad", title: "Could not record the scan", detail: /forbidden/.test(error.message) ? "Your role cannot scan." : "Check your connection and try again." }); return; }
      const r = data as { result: string; name?: string; scannedAt?: string; otherCompany?: boolean };
      const other = r.otherCompany ? " This employee belongs to a different company." : "";
      if (r.result === "ok") { setOutcome({ kind: r.otherCompany ? "warn" : "ok", title: `${r.name} recorded`, detail: r.otherCompany ? other.trim() : undefined }); navigator.vibrate?.(80); }
      else if (r.result === "duplicate") setOutcome({ kind: "warn", title: `${r.name} was already scanned today`, detail: r.scannedAt ? `At ${fmt(r.scannedAt)}. Nothing was added.` : undefined });
      else if (r.result === "inactive") setOutcome({ kind: "bad", title: `${r.name} is inactive`, detail: "Not recorded." });
      else if (r.result === "company_unavailable") setOutcome({ kind: "bad", title: "This company is archived", detail: "Choose another company." });
      else setOutcome({ kind: "bad", title: "Unknown QR code", detail: "It is not a current employee QR code." });
      const { data: list } = await supabase.rpc("company_scans", { p_company: companyId });
      if (list) setScans(list);
    } finally { busy.current = false; }
  }, [supabase, companyId]);

  const handleText = useCallback((text: string) => {
    const token = tokenFromScan(text) ?? (UUID.test(text.trim()) ? text.trim().toLowerCase() : null);
    if (!token) { setOutcome({ kind: "bad", title: "Not a PickupQR code", detail: "That QR code was not made by this app." }); return; }
    const now = Date.now();
    if (last.current.token === token && now - last.current.at < 4000) return; // same code still in view
    last.current = { token, at: now };
    void submit(token);
  }, [submit]);

  async function startCamera() {
    setCamError(null); setCamera("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      stream.current = s;
      const v = video.current!;
      v.srcObject = s; await v.play();
      setCamera("on");
      const c = canvas.current!, ctx = c.getContext("2d", { willReadFrequently: true })!;
      let lastTick = 0;
      const tick = (t: number) => {
        raf.current = requestAnimationFrame(tick);
        if (t - lastTick < 120 || v.readyState < 2 || !v.videoWidth) return; // about 8 looks per second
        lastTick = t;
        const w = Math.min(640, v.videoWidth), h = Math.round((w / v.videoWidth) * v.videoHeight);
        c.width = w; c.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) handleText(code.data);
      };
      raf.current = requestAnimationFrame(tick);
    } catch (e) {
      stopCamera();
      const denied = (e as DOMException)?.name === "NotAllowedError";
      setCamError(denied ? "Camera permission was denied. Allow the camera for this site, or type the code below." : "No camera could be started. You can still type or paste the code below.");
    }
  }

  function onManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manual.trim()) return;
    handleText(manual);
    setManual("");
  }

  const tone = { ok: "bg-emerald-50 text-emerald-900 border-emerald-200", warn: "bg-amber-50 text-amber-900 border-amber-200", bad: "bg-red-50 text-red-800 border-red-200" };

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-3">
        <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "4 / 3", display: camera === "off" ? "none" : "block" }}>
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" aria-hidden />
        </div>
        <canvas ref={canvas} className="hidden" />
        {camera === "off" && (
          <div className="grid place-items-center gap-2 rounded-xl bg-neutral-50 px-4 py-8 text-center">
            <p className="text-sm text-neutral-600">Use the phone camera to scan, or type the code below (a USB or Bluetooth scanner works too).</p>
            <button className="btn-primary" onClick={startCamera}>Start camera</button>
          </div>
        )}
        {camera === "starting" && <p className="py-3 text-center text-sm text-neutral-500">Starting camera…</p>}
        {camera === "on" && <div className="mt-3 flex justify-center"><button className="btn-secondary" onClick={stopCamera}>Stop camera</button></div>}
        {camError && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{camError}</p>}

        <form onSubmit={onManual} className="mt-3 flex gap-2">
          <input className="field flex-1" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type or paste a code (pickupqr:…)" aria-label="QR code text" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <button className="btn-secondary">Add</button>
        </form>
      </section>

      <div aria-live="polite">
        {outcome && (
          <div className={`rounded-xl border px-4 py-3 ${tone[outcome.kind]}`}>
            <p className="font-semibold">{outcome.kind === "ok" ? "✓ " : outcome.kind === "warn" ? "! " : "✕ "}{outcome.title}</p>
            {outcome.detail && <p className="text-sm">{outcome.detail}</p>}
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold">Scanned today <span className="text-sm font-normal text-neutral-500">({scans.length})</span></h2>
        {scans.length === 0 ? <Empty>No scans yet today for this company.</Empty> : (
          <ul className="flex flex-col gap-2">
            {scans.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 p-3 text-sm">
                <span className="w-12 shrink-0 tabular-nums text-neutral-500">{fmt(s.scanned_at)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{s.employee_name}</span>
                {s.other_company && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">other company</span>}
                <span className="hidden shrink-0 text-xs text-neutral-500 sm:inline">{s.scanned_by_name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
