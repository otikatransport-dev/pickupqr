"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dot, Empty, Label, Notice } from "@/components/ui";
import type { StopStatus, TrackerCompany, TrackerStop } from "@/lib/driver-route";

const ERR: Record<string, string> = {
  vehicle_required: "Enter a vehicle number for every stop before posting.",
  invalid_vehicle: "That vehicle number is too long (30 characters at most).",
  company_unavailable: "A company in your route was archived. Remove it and save again.",
  duplicate_company: "A company can only be in your route once.",
  forbidden: "Only drivers can plan a route.",
  not_signed_in: "Your session ended. Sign in again.",
  migration_missing: "The route feature is not set up yet. Ask your admin to run database update 0008.",
};

type Drag = { from: "pool" | "route"; id: string } | null;

export default function RouteTracker({
  companies, initial, initialStatus, routeDate,
}: { companies: TrackerCompany[]; initial: TrackerStop[]; initialStatus: string | null; routeDate: string | null }) {
  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  // Stops whose company was archived since are kept visible so nothing silently disappears.
  const [stops, setStops] = useState<TrackerStop[]>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null); // company id whose modal is open
  const [vehicle, setVehicle] = useState("");
  const [vehicleErr, setVehicleErr] = useState(false);
  const [drag, setDrag] = useState<Drag>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [overPool, setOverPool] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dirty = JSON.stringify(stops) !== saved;
  const inRoute = useMemo(() => new Set(stops.map((s) => s.companyId)), [stops]);
  const pool = useMemo(() => {
    const t = q.trim().toLowerCase();
    return companies.filter((c) => !inRoute.has(c.id)).filter((c) => !t || [c.name, c.address, c.code].join(" ").toLowerCase().includes(t));
  }, [companies, inRoute, q]);
  const locked = status === "completed";

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  function flash(ok: boolean, text: string) {
    setToast({ ok, text });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4500);
  }

  function add(id: string, at?: number) {
    if (locked || inRoute.has(id)) return;
    setStops((s) => { const n = [...s]; n.splice(at ?? n.length, 0, { companyId: id, vehicleNumber: "", status: "pending" }); return n; });
  }
  function remove(id: string) { if (!locked) setStops((s) => s.filter((x) => x.companyId !== id)); }
  function move(id: string, to: number) {
    if (locked) return;
    setStops((s) => {
      const from = s.findIndex((x) => x.companyId === id);
      if (from < 0) return s;
      const n = [...s]; const [item] = n.splice(from, 1);
      n.splice(Math.max(0, Math.min(to, n.length)), 0, item); return n;
    });
  }

  async function persist(next: TrackerStop[], post: boolean): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/driver/route", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ stops: next, post }) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) { flash(false, ERR[json?.error] ?? "Could not save your route. Try again."); return false; }
      setStops(next); setSaved(JSON.stringify(next));
      setStatus((cur) => {
        const posted = post || cur === "submitted" || cur === "completed";
        if (!posted) return cur ?? "draft";
        return next.length > 0 && next.every((s) => s.status === "completed") ? "completed" : "submitted";
      });
      return true;
    } catch { flash(false, "No connection. Your route was not saved."); return false; }
    finally { setBusy(false); }
  }

  async function save() { if (await persist(stops, false)) flash(true, "Route saved."); }
  async function post() {
    if (!stops.length) { flash(false, "Add at least one company first."); return; }
    if (stops.some((s) => !s.vehicleNumber.trim())) { flash(false, ERR.vehicle_required); return; }
    if (await persist(stops, true)) flash(true, "Route posted. Other drivers can now see it.");
  }

  function openStop(id: string) {
    const s = stops.find((x) => x.companyId === id);
    setOpen(id); setVehicle(s?.vehicleNumber ?? ""); setVehicleErr(false);
  }
  async function continueStop(markDone = false) {
    if (!open) return;
    const v = vehicle.trim();
    if (!v) { setVehicleErr(true); return; }
    const idx = stops.findIndex((s) => s.companyId === open);
    const next = stops.map((s, i) => (i === idx ? { ...s, vehicleNumber: v, status: (markDone ? "completed" : s.status === "pending" ? "in_progress" : s.status) as StopStatus } : s));
    if (await persist(next, false)) {
      const following = next[idx + 1];
      flash(true, markDone ? "Stop completed." : "Vehicle saved.");
      if (following) { setOpen(following.companyId); setVehicle(following.vehicleNumber); setVehicleErr(false); } else setOpen(null);
    }
  }

  // ---- drag and drop (mouse); touch uses the buttons ----
  const onDragStart = (from: "pool" | "route", id: string) => (e: React.DragEvent) => { setDrag({ from, id }); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); };
  const endDrag = () => { setDrag(null); setOverIndex(null); setOverPool(false); };
  const dropOnRoute = (index: number) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const d = drag; endDrag();
    if (!d) return;
    if (d.from === "pool") add(d.id, index); else move(d.id, stops.findIndex((s) => s.companyId === d.id) < index ? index - 1 : index);
  };
  const dropOnPool = (e: React.DragEvent) => { e.preventDefault(); const d = drag; endDrag(); if (d?.from === "route") remove(d.id); };

  const openCompany = open ? byId.get(open) : null;
  const openStopData = open ? stops.find((s) => s.companyId === open) : null;

  return (
    <div className="flex flex-col gap-3">
      {toast && <div className="fixed inset-x-4 top-16 z-50 mx-auto max-w-md"><Notice kind={toast.ok ? "ok" : "error"}>{toast.text}</Notice></div>}
      {locked && <Notice kind="info">All stops are completed. Your route for today is finished.</Notice>}

      <div className="grid gap-4 md:grid-cols-2">
        {/* ---- left: available companies ---- */}
        <section onDragOver={(e) => { if (drag?.from === "route") { e.preventDefault(); setOverPool(true); } }} onDragLeave={() => setOverPool(false)} onDrop={dropOnPool}
          className={`card flex max-h-[70vh] min-h-64 flex-col p-3 ${overPool ? "ring-2 ring-brand" : ""}`} aria-label="Available companies">
          <h2 className="mb-2 text-base font-semibold">Available companies <span className="text-sm font-normal text-neutral-500">({pool.length})</span></h2>
          <input className="field mb-2" type="search" placeholder="Search companies" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search companies" />
          <ul className="flex-1 space-y-2 overflow-y-auto">
            {companies.length === 0 ? <li><Empty>No companies yet. Ask your admin to add some.</Empty></li>
              : pool.length === 0 ? <li><Empty>{q ? "No company matches your search." : "Every company is already in your route."}</Empty></li>
              : pool.map((c) => (
                <li key={c.id} draggable={!locked} onDragStart={onDragStart("pool", c.id)} onDragEnd={endDrag}
                  className="flex cursor-grab items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2.5 active:cursor-grabbing">
                  <Dot color={c.color} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.name}</p>{c.address && <p className="truncate text-xs text-neutral-500">{c.address}</p>}</div>
                  <button className="btn-secondary !min-h-9 !px-3" disabled={locked} onClick={() => add(c.id)} aria-label={`Add ${c.name} to my route`}>Add</button>
                </li>
              ))}
          </ul>
        </section>

        {/* ---- right: my route ---- */}
        <section onDragOver={(e) => { if (drag) { e.preventDefault(); setOverIndex(stops.length); } }} onDrop={dropOnRoute(stops.length)}
          className="card flex max-h-[70vh] min-h-64 flex-col p-3" aria-label="My route">
          <h2 className="mb-2 text-base font-semibold">My route <span className="text-sm font-normal text-neutral-500">({stops.length} stops{routeDate ? ` · ${routeDate}` : ""})</span></h2>
          <ol className="flex-1 space-y-2 overflow-y-auto">
            {stops.length === 0 && <li><Empty>Your route is empty. Drag a company here, or tap Add on the left.</Empty></li>}
            {stops.map((s, i) => {
              const c = byId.get(s.companyId);
              return (
                <li key={s.companyId} draggable={!locked} onDragStart={onDragStart("route", s.companyId)} onDragEnd={endDrag}
                  onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); setOverIndex(i); } }} onDrop={dropOnRoute(i)}
                  className={`flex items-center gap-2 rounded-xl border bg-white p-2.5 ${overIndex === i ? "border-brand border-t-4" : "border-neutral-200"} ${locked ? "" : "cursor-grab active:cursor-grabbing"}`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{i + 1}</span>
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => openStop(s.companyId)}>
                    <Dot color={c?.color ?? null} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c?.name ?? "Archived company"}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {s.vehicleNumber ? `Vehicle ${s.vehicleNumber}` : "Vehicle number needed"}{s.status !== "pending" ? ` · ${s.status === "completed" ? "Completed" : "In progress"}` : ""}
                      </span>
                    </span>
                  </button>
                  {!locked && (
                    <div className="flex shrink-0 items-center">
                      <button className="px-2 py-1 text-neutral-500 disabled:opacity-30" disabled={i === 0} onClick={() => move(s.companyId, i - 1)} aria-label="Move up">▲</button>
                      <button className="px-2 py-1 text-neutral-500 disabled:opacity-30" disabled={i === stops.length - 1} onClick={() => move(s.companyId, i + 1)} aria-label="Move down">▼</button>
                      <button className="px-2 py-1 text-lg leading-none text-red-700" onClick={() => remove(s.companyId)} aria-label={`Remove ${c?.name ?? "stop"}`}>×</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3">
            <button className="btn-primary" disabled={busy || !dirty || locked} onClick={save}>{busy ? "Saving…" : "Save route"}</button>
            <button className="btn-secondary" disabled={busy || locked || !stops.length} onClick={post}>{status === "submitted" || status === "completed" ? "Update posted route" : "Post route"}</button>
            <span className="text-xs text-neutral-500">{dirty ? "Unsaved changes" : status === "submitted" || status === "completed" ? "Posted" : stops.length ? "Saved, not posted" : ""}</span>
          </div>
        </section>
      </div>

      {/* ---- stop dialog ---- */}
      {open && openCompany && openStopData && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={openCompany.name} onClick={(e) => e.stopPropagation()} className="card flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-auto p-5">
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Dot color={openCompany.color} />{openCompany.name}</h3>
            <dl className="space-y-1 rounded-xl bg-neutral-50 p-3 text-sm">
              <div><dt className="inline text-neutral-500">Address: </dt><dd className="inline">{openCompany.address || "—"}</dd></div>
              <div><dt className="inline text-neutral-500">Contact: </dt><dd className="inline">{[openCompany.contact, openCompany.phone].filter(Boolean).join(" · ") || "—"}</dd></div>
              {openCompany.code && <div><dt className="inline text-neutral-500">Code: </dt><dd className="inline">{openCompany.code}</dd></div>}
            </dl>
            <Label label="Vehicle number (required)">
              <input className={`field ${vehicleErr ? "!border-red-500" : ""}`} autoFocus value={vehicle} maxLength={30} disabled={locked}
                onChange={(e) => { setVehicle(e.target.value); setVehicleErr(false); }} onKeyDown={(e) => { if (e.key === "Enter") continueStop(); }} placeholder="e.g. 4521" />
            </Label>
            {vehicleErr && <Notice kind="error">Enter the vehicle number to continue.</Notice>}
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-secondary" onClick={() => setOpen(null)}>Close</button>
              {(status === "submitted" || status === "completed") && openStopData.status !== "completed" && !locked && (
                <button className="btn-secondary" disabled={busy} onClick={() => continueStop(true)}>Mark completed</button>
              )}
              <button className="btn-primary" disabled={busy || locked} onClick={() => continueStop()}>{busy ? "Saving…" : "Continue"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
