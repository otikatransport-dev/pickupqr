/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isHexColor } from "@/lib/branding";
import {
  EXCEL_LIGHT, EXCEL_STD, STATIONS, computeApprox, computeRoute, fmtDist, fmtDur, gmLink, legKey, legsOf, textOn,
  type RouteRes,
} from "@/lib/routes";

export interface CompanyRoute {
  id: string; name: string; address: string | null; metro_aller: string | null; metro_retour: string | null;
  contact: string | null; notes: string | null; color: string | null;
}
type Dir = "aller" | "retour" | "combo";
type Form = { name: string; address: string; metro_aller: string; metro_retour: string; contact: string; notes: string; color: string };
const EMPTY: Form = { name: "", address: "", metro_aller: "", metro_retour: "", contact: "", notes: "", color: "" };

const KEY_API = "otika_trajets_apikey", KEY_ETA = "otika_eta_v1";
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const lsDel = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

let mapsPromise: Promise<void> | null = null;
function loadMaps(apiKey: string, onAuthFail: () => void): Promise<void> {
  const w = window as any;
  if (w.google?.maps?.geometry) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise<void>((res, rej) => {
    w.__mapsReady = () => res();
    w.gm_authFailure = onAuthFail;
    const s = document.createElement("script");
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(apiKey) + "&libraries=geometry&language=fr&region=CA&callback=__mapsReady";
    s.async = true;
    s.onerror = () => { mapsPromise = null; rej(new Error("chargement")); };
    document.head.appendChild(s);
  });
  return mapsPromise;
}

export default function RouteOptimizer({ initial, isSuper }: { initial: CompanyRoute[]; isSuper: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [companies, setCompanies] = useState<CompanyRoute[]>(initial);
  const [selId, setSelId] = useState<string | null>(initial[0]?.id ?? null);
  const [dir, setDir] = useState<Dir>("aller");
  const [q, setQ] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [res, setRes] = useState<Record<string, RouteRes>>({});
  const [cardMsg, setCardMsg] = useState<Record<"aller" | "retour", string>>({ aller: "", retour: "" });
  const [apiKey, setApiKey] = useState("");
  const [mapsFailed, setMapsFailed] = useState(false);
  const [online, setOnline] = useState(true);
  const [overlay, setOverlay] = useState<{ text: string; err?: boolean } | null>(null);
  const [tick, setTick] = useState(0);
  const [updated, setUpdated] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [palFor, setPalFor] = useState<string | null>(null);
  const [calcAll, setCalcAll] = useState("");
  const [frameSrc, setFrameSrc] = useState("");
  const mapDiv = useRef<HTMLDivElement>(null);
  const gmap = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const sel = companies.find((c) => c.id === selId) ?? null;
  const useGoogle = !!apiKey && !mapsFailed;

  // browser-only state
  useEffect(() => {
    setApiKey(lsGet(KEY_API) ?? "");
    try { setRes(JSON.parse(lsGet(KEY_ETA) || "{}")); } catch { /* ignore */ }
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener("online", on); addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);

  const putRes = useCallback((k: string, r: RouteRes) => {
    setRes((prev) => {
      const next = { ...prev, [k]: r };
      if (r.approx) {
        const only: Record<string, RouteRes> = {};
        for (const [kk, v] of Object.entries(next)) if (v.approx) only[kk] = v;
        lsSet(KEY_ETA, JSON.stringify(only));
      }
      return next;
    });
  }, []);

  const drawRoute = useCallback((list: { r: RouteRes; color: string }[]) => {
    const g = (window as any).google;
    if (!g || !mapDiv.current) return;
    if (!gmap.current) gmap.current = new g.maps.Map(mapDiv.current, { center: { lat: 45.508, lng: -73.587 }, zoom: 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
    overlays.current.forEach((o) => o.setMap(null)); overlays.current = [];
    const bounds = new g.maps.LatLngBounds(); const pts: any[] = [];
    list.forEach(({ r, color }, i) => {
      if (!r.poly) return;
      const path = g.maps.geometry.encoding.decodePath(r.poly);
      overlays.current.push(new g.maps.Polyline({ path, strokeColor: color, strokeWeight: 6, strokeOpacity: 0.85, map: gmap.current, zIndex: list.length - i }));
      path.forEach((p: any) => bounds.extend(p));
      if (!pts.length) pts.push(path[0]);
      pts.push(path[path.length - 1]);
    });
    if (!pts.length) return;
    const labels = dir === "combo" ? ["M", "E", "M"] : dir === "aller" ? ["M", "E"] : ["E", "M"];
    pts.forEach((pos, i) => overlays.current.push(new g.maps.Marker({ position: pos, map: gmap.current, label: { text: labels[i] || "", color: "#fff", fontWeight: "700" } })));
    gmap.current.fitBounds(bounds, 40);
  }, [dir]);

  // compute + draw whenever the selection, direction or data change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sel) { setOverlay({ text: "Sélectionnez une entreprise" }); return; }
      const L = legsOf(sel);
      const msgs = { aller: "", retour: "" };
      for (const d of ["aller", "retour"] as const) if (!L[d].from || !L[d].to) msgs[d] = "Station ou adresse manquante";
      setCardMsg(msgs);
      if (!online) { setOverlay({ text: "Pas de connexion Internet — Google Maps n'est pas accessible.", err: true }); return; }
      const combo = dir === "combo";
      const cur = combo ? { from: L.aller.from, to: L.retour.to } : L[dir];
      if (!cur.from || !cur.to || (combo && !L.aller.to)) { setOverlay({ text: "Complétez la station de métro et l'adresse pour voir le trajet." }); return; }
      setOverlay(null);
      const force = tick > 0;

      if (!useGoogle) {
        setFrameSrc("https://maps.google.com/maps?saddr=" + encodeURIComponent(cur.from) + "&daddr=" +
          (combo ? encodeURIComponent(sel.address ?? "") + "+to:" : "") + encodeURIComponent(cur.to) + "&hl=fr&output=embed");
        for (const d of ["aller", "retour"] as const) {
          const l = L[d]; if (!l.from || !l.to) continue;
          const k = legKey(l);
          if (res[k] && !force) continue;
          setCardMsg((m) => ({ ...m, [d]: "…" }));
          try { const r = await computeApprox(l.from, l.to); if (cancelled) return; putRes(k, r); setCardMsg((m) => ({ ...m, [d]: "" })); }
          catch { if (!cancelled) setCardMsg((m) => ({ ...m, [d]: "Temps non trouvé : cliquez « Ouvrir dans Google Maps »" })); }
        }
        return;
      }

      try { await loadMaps(apiKey, () => { setMapsFailed(true); setOverlay({ text: "Clé Google Maps refusée. Vérifiez la clé et que « Maps JavaScript API » est activée.", err: true }); }); }
      catch { if (!cancelled) setMapsFailed(true); return; }
      const got: Record<string, RouteRes> = {};
      for (const d of ["aller", "retour"] as const) {
        const l = L[d]; if (!l.from || !l.to) continue;
        const k = legKey(l);
        if (res[k] && !res[k].approx && !force) { got[k] = res[k]; continue; }
        try { const r = await computeRoute(l.from, l.to, apiKey); if (cancelled) return; putRes(k, r); got[k] = r; }
        catch (e) { if (!cancelled) setCardMsg((m) => ({ ...m, [d]: "Erreur : " + (e as Error).message })); }
      }
      if (cancelled) return;
      setUpdated(new Date().toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }));
      const a = got[legKey(L.aller)], r = got[legKey(L.retour)];
      if (combo) { if (a && r) drawRoute([{ r: a, color: "#1f8a4c" }, { r, color: "#c2410c" }]); else setOverlay({ text: "Impossible de calculer un des deux trajets. Vérifiez l'adresse ou les stations.", err: true }); }
      else { const one = got[legKey(L[dir])]; if (one) drawRoute([{ r: one, color: dir === "aller" ? "#1f8a4c" : "#c2410c" }]); else setOverlay({ text: "Impossible de calculer ce trajet. Vérifiez l'adresse ou la station.", err: true }); }
    })();
    return () => { cancelled = true; };
    // `res` is intentionally read but not a trigger: results are written by this effect itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, dir, online, apiKey, mapsFailed, tick]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return companies
      .filter((c) => !colorFilter || c.color === colorFilter)
      .filter((c) => !t || [c.name, c.address, c.metro_aller, c.metro_retour].join(" ").toLowerCase().includes(t))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [companies, q, colorFilter]);
  const usedColors = useMemo(() => [...new Set(companies.map((c) => c.color).filter(Boolean))] as string[], [companies]);

  const legRes = (c: CompanyRoute, d: "aller" | "retour") => res[legKey(legsOf(c)[d])];
  const fmtLeg = (r?: RouteRes) => (r ? (r.approx ? "≈ " : "") + fmtDur(r.dur) : "");

  // ---------- saving ----------
  function openForm(c: CompanyRoute | null) {
    setMsg(null); setEditingId(c?.id ?? null);
    setForm(c ? { name: c.name, address: c.address ?? "", metro_aller: c.metro_aller ?? "", metro_retour: c.metro_retour ?? "", contact: c.contact ?? "", notes: c.notes ?? "", color: c.color ?? "" } : { ...EMPTY });
  }
  const toRow = (f: Form) => ({
    name: f.name.trim(), address: f.address.trim() || null, metro_aller: f.metro_aller.trim() || null, metro_retour: f.metro_retour.trim() || null,
    contact: f.contact.trim() || null, notes: f.notes.trim() || null, color: f.color && isHexColor(f.color) ? f.color.toLowerCase() : null,
  });
  const COLS = "id, name, address, metro_aller, metro_retour, contact, notes, color";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true); setMsg(null);
    const row = toRow(form);
    if (editingId) {
      const { data, error } = await supabase.from("companies").update(row).eq("id", editingId).select(COLS);
      setBusy(false);
      if (error || !data?.length) { setMsg({ ok: false, text: error?.message ?? "Modification refusée. Avez-vous exécuté la migration 0004 ?" }); return; }
      setCompanies((cs) => cs.map((c) => (c.id === editingId ? (data[0] as CompanyRoute) : c)));
    } else {
      const { data, error } = await supabase.from("companies").insert(row).select(COLS);
      setBusy(false);
      if (error || !data?.length) { setMsg({ ok: false, text: error?.message ?? "Ajout refusé." }); return; }
      setCompanies((cs) => [...cs, data[0] as CompanyRoute]); setSelId((data[0] as CompanyRoute).id);
    }
    setForm(null); setMsg({ ok: true, text: "Entreprise enregistrée." });
  }

  async function remove() {
    const c = companies.find((x) => x.id === editingId);
    if (!c || !confirm("Supprimer « " + c.name + " » ? Ses points d'embarquement et trajets seront aussi supprimés.")) return;
    setBusy(true);
    const { error } = await supabase.from("companies").delete().eq("id", c.id);
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    const rest = companies.filter((x) => x.id !== c.id);
    setCompanies(rest); setSelId(rest[0]?.id ?? null); setForm(null); setMsg({ ok: true, text: "Entreprise supprimée." });
  }

  async function setColor(id: string, hex: string) {
    setPalFor(null);
    const { error } = await supabase.from("companies").update({ color: hex || null }).eq("id", id);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setCompanies((cs) => cs.map((c) => (c.id === id ? { ...c, color: hex || null } : c)));
  }

  // ---------- export / import ----------
  function exportJson() {
    const out = companies.map((c) => ({ id: c.id, nom: c.name, adresse: c.address ?? "", metroAller: c.metro_aller ?? "", metroRetour: c.metro_retour ?? "", contact: c.contact ?? "", notes: c.notes ?? "", color: c.color ?? "" }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = "entreprises-trajets-" + new Date().toISOString().slice(0, 10) + ".json"; a.click();
  }
  async function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      const arr = JSON.parse(await file.text());
      if (!Array.isArray(arr)) throw new Error("format");
      const have = new Set(companies.map((c) => c.name.trim().toLowerCase()));
      const fresh = arr.filter((c: any) => c?.nom && !have.has(String(c.nom).trim().toLowerCase())).map((c: any) => toRow({
        name: String(c.nom), address: String(c.adresse ?? ""), metro_aller: String(c.metroAller ?? ""), metro_retour: String(c.metroRetour ?? ""),
        contact: String(c.contact ?? ""), notes: String(c.notes ?? ""), color: String(c.color ?? ""),
      }));
      if (!fresh.length) { setMsg({ ok: true, text: "Rien à importer : toutes ces entreprises existent déjà." }); return; }
      if (!confirm("Importer " + fresh.length + " nouvelle(s) entreprise(s) ? Les noms déjà présents sont ignorés.")) return;
      const { data, error } = await supabase.from("companies").insert(fresh).select(COLS);
      if (error) { setMsg({ ok: false, text: error.message }); return; }
      setCompanies((cs) => [...cs, ...((data ?? []) as CompanyRoute[])]);
      setMsg({ ok: true, text: (data?.length ?? 0) + " entreprise(s) importée(s)." });
    } catch { setMsg({ ok: false, text: "Fichier invalide." }); }
  }

  async function computeAll() {
    if (!online) { setMsg({ ok: false, text: "Pas de connexion Internet." }); return; }
    let i = 0;
    for (const c of companies) {
      i++; setCalcAll(`Calcul… ${i}/${companies.length}`);
      const L = legsOf(c);
      for (const d of ["aller", "retour"] as const) {
        const l = L[d]; if (!l.from || !l.to) continue;
        try { putRes(legKey(l), useGoogle ? await computeRoute(l.from, l.to, apiKey) : res[legKey(l)] ?? (await computeApprox(l.from, l.to))); } catch { /* skip */ }
      }
    }
    setCalcAll("");
  }

  const L = sel ? legsOf(sel) : null;
  const card = (d: "aller" | "retour") => {
    const r = L ? res[legKey(L[d])] : undefined;
    const active = dir === "combo" || dir === d;
    const color = d === "aller" ? "#1f8a4c" : "#c2410c";
    const m = cardMsg[d];
    return (
      <div key={d} role="button" tabIndex={0} onClick={() => setDir(d)} onKeyDown={(e) => e.key === "Enter" && setDir(d)}
        className="card cursor-pointer border-2 p-4" style={active ? { borderColor: color } : undefined}>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[150px] flex-1">
            <p className="text-xs font-bold tracking-wider" style={{ color }}>{d === "aller" ? "ALLER — ramassage au métro" : "RETOUR — dépôt au métro"}</p>
            <p className="mt-1 text-sm">{d === "aller" ? <>🚇 <b>{sel?.metro_aller || "—"}</b> → 🏢 {sel?.name}</> : <>🏢 {sel?.name} → 🚇 <b>{sel?.metro_retour || "—"}</b></>}</p>
          </div>
          <div className="min-w-[110px] rounded-xl bg-neutral-100 px-3 py-2 text-center">
            <p className="whitespace-nowrap text-2xl font-bold" style={{ color }}>{r ? (r.approx ? "≈ " : "") + fmtDur(r.dur) : m === "…" ? "…" : "—"}</p>
            <p className="whitespace-nowrap text-[11px] text-neutral-500">{r ? (r.approx ? "approx. sans trafic" : "Google · avec trafic") : ""}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <p className="text-sm text-neutral-500">
            {r ? fmtDist(r.dist) + " en voiture" + (r.approx ? " · heure de pointe : prévoir plus" : r.stat && r.dur - r.stat >= 60 ? " · +" + fmtDur(r.dur - r.stat) + " de trafic" : "") : m === "…" ? "Calcul du temps approximatif…" : m}
          </p>
          {L && <a href={gmLink(L[d].from, L[d].to)} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-brand hover:underline">Ouvrir dans Google Maps ↗</a>}
        </div>
      </div>
    );
  };

  const a = L ? res[legKey(L.aller)] : undefined, rr = L ? res[legKey(L.retour)] : undefined;
  const comboInfo = dir === "combo" && a && rr ? "Total " + (a.approx ? "≈ " : ": ") + fmtDur(a.dur + rr.dur) + " · " + fmtDist(a.dist + rr.dist) + (a.approx ? " (sans trafic)" : "") : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-neutral-100 px-3 py-1"><span className={online ? "text-emerald-600" : "text-red-600"}>●</span> {online ? "En ligne" : "Hors ligne"}</span>
        <span className="rounded-full bg-neutral-100 px-3 py-1"><span className={useGoogle ? "text-emerald-600" : "text-amber-500"}>●</span> {apiKey ? (mapsFailed ? "Clé invalide" : "Temps de trajet actif") : "Sans clé (carte seule)"}</span>
        <button className="btn-secondary !min-h-8 !px-3 !text-xs" onClick={() => { setKeyDraft(apiKey); setShowKey(true); }}>⚙ Google Maps</button>
        {msg && <span role="status" className={msg.ok ? "text-emerald-700" : "text-red-700"}>{msg.text}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* ---- list ---- */}
        <aside className="card flex max-h-[80vh] flex-col overflow-hidden">
          <div className="flex gap-2 border-b border-neutral-200 p-3">
            <input className="field" placeholder="Rechercher une entreprise…" value={q} onChange={(e) => setQ(e.target.value)} />
            {isSuper && <button className="btn-primary !min-h-10 !px-3" title="Ajouter" onClick={() => openForm(null)}>+</button>}
          </div>
          <p className="px-3 pt-2 text-xs text-neutral-500">{rows.length} entreprise{rows.length > 1 ? "s" : ""}</p>
          {usedColors.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 py-2">
              <button className="rounded px-2 text-[11px]" style={colorFilter ? undefined : { background: "#1b2430", color: "#fff" }} onClick={() => setColorFilter("")}>Toutes</button>
              {usedColors.map((h) => <button key={h} title="Filtrer par cette couleur" aria-label={"Filtrer " + h} onClick={() => setColorFilter(colorFilter === h ? "" : h)}
                className="h-[18px] w-[18px] rounded border border-black/20" style={{ background: h, outline: colorFilter === h ? "2px solid #1b2430" : undefined, outlineOffset: 1 }} />)}
            </div>
          )}
          <div className="flex-1 overflow-auto">
            {rows.length === 0 && <p className="p-6 text-center text-sm text-neutral-500">Aucune entreprise.</p>}
            {rows.map((c) => (
              <div key={c.id} onClick={() => setSelId(c.id)} className={`relative cursor-pointer border-b border-neutral-200 border-l-4 p-3 ${c.id === selId ? "bg-brand-soft" : "hover:bg-neutral-50"}`} style={{ borderLeftColor: c.color ?? "transparent" }}>
                <div className="flex items-center gap-2">
                  <p className={`min-w-0 flex-1 truncate font-semibold ${c.color ? "rounded border border-black/10 px-2 py-0.5" : ""}`} style={c.color ? { background: c.color, color: textOn(c.color) } : undefined}>{c.name}</p>
                  <button className="btn-secondary !min-h-7 !w-7 !px-0 text-xs" title="Couleur" onClick={(e) => { e.stopPropagation(); setPalFor(palFor === c.id ? null : c.id); }}>🎨</button>
                </div>
                {palFor === c.id && (
                  <div className="card absolute right-2 top-10 z-20 p-3 shadow-lg" onClick={(e) => e.stopPropagation()}>
                    <Palette cur={c.color ?? ""} onPick={(h) => setColor(c.id, h)} />
                  </div>
                )}
                <p className="mt-0.5 text-xs text-neutral-500">{c.address}</p>
                <div className="mt-1.5 grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-semibold text-emerald-700">ALLER</span><span>🚇 {c.metro_aller || "—"}</span><span className="font-semibold text-neutral-500">{fmtLeg(legRes(c, "aller"))}</span>
                  <span className="font-semibold text-orange-700">RETOUR</span><span>🚇 {c.metro_retour || "—"}</span><span className="font-semibold text-neutral-500">{fmtLeg(legRes(c, "retour"))}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-neutral-200 p-3">
            <button className="btn-secondary !min-h-8 !px-3 !text-xs" onClick={exportJson}>⬇ Exporter</button>
            {isSuper && <button className="btn-secondary !min-h-8 !px-3 !text-xs" onClick={() => fileRef.current?.click()}>⬆ Importer</button>}
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={importJson} />
            <button className="btn-secondary !min-h-8 !px-3 !text-xs" disabled={!!calcAll} onClick={computeAll}>{calcAll ? "⏱ " + calcAll : "⏱ Calculer tous"}</button>
          </div>
        </aside>

        {/* ---- detail ---- */}
        <section className="flex min-w-0 flex-col gap-3">
          {sel ? (
            <>
              <div className="card flex items-start gap-4 p-4" style={sel.color ? { borderLeft: "6px solid " + sel.color } : undefined}>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold">{sel.name}</h2>
                  <p className="text-sm text-neutral-500">📍 {sel.address || "Adresse manquante"}</p>
                  {sel.contact && <p className="mt-1 text-sm">☎ {sel.contact}</p>}
                  {sel.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{sel.notes}</p>}
                </div>
                <button className="btn-secondary" onClick={() => openForm(sel)}>✎ Modifier</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">{card("aller")}{card("retour")}</div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button className={`btn-secondary !min-h-9 !px-3 ${dir === "combo" ? "!bg-violet-700 !text-white" : "!border-violet-600 !text-violet-700"}`} onClick={() => setDir(dir === "combo" ? "aller" : "combo")}>
                  {dir === "combo" ? "✕ Quitter la vue combinée" : "⇄ Combiner ALLER + RETOUR"}
                </button>
                <span className="font-semibold">{comboInfo}</span>
                {dir === "combo" && L && <a className="font-semibold text-violet-700" target="_blank" rel="noopener" href={gmLink(L.aller.from, L.retour.to, sel.address ?? "")}>Ouvrir le trajet complet dans Google Maps ↗</a>}
                <span className="flex-1" />
                <button className="btn-secondary !min-h-9 !px-3" onClick={() => setTick((t) => t + 1)}>↻ Actualiser (trafic)</button>
                {updated && <span className="text-neutral-500">Mis à jour à {updated}</span>}
              </div>
              <div className="relative min-h-[320px] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200">
                <div ref={mapDiv} className={`absolute inset-0 ${useGoogle ? "" : "hidden"}`} />
                {!useGoogle && frameSrc && <iframe title="Carte" src={frameSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="absolute inset-0 h-full w-full border-0" />}
                {overlay && <div className={`absolute inset-0 flex items-center justify-center bg-neutral-100/95 p-5 text-center text-sm font-semibold ${overlay.err ? "text-red-700" : "text-neutral-500"}`}>{overlay.text}</div>}
              </div>
            </>
          ) : (
            <div className="card p-8 text-center text-sm text-neutral-500">Aucune entreprise sélectionnée. {isSuper ? "Cliquez sur + pour en ajouter une." : ""}</div>
          )}
        </section>
      </div>

      {/* ---- company dialog ---- */}
      {form && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setForm(null)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card flex max-h-[92vh] w-full max-w-lg flex-col gap-3 overflow-auto p-5">
            <h3 className="text-lg font-semibold">{editingId ? "Modifier l'entreprise" : "Nouvelle entreprise"}</h3>
            <Field label="Nom de l'entreprise"><input className="field" required disabled={!isSuper} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Adresse de la compagnie"><input className="field" required value={form.address} placeholder="ex. 1234 rue Exemple, Montréal, QC H1A 1A1" onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Station de métro ALLER — où on ramasse"><input className="field" list="stations" value={form.metro_aller} placeholder="ex. Lionel-Groulx" onChange={(e) => setForm({ ...form, metro_aller: e.target.value })} /></Field>
            <Field label="Station de métro RETOUR — où on dépose"><input className="field" list="stations" value={form.metro_retour} placeholder="ex. Côte-Vertu" onChange={(e) => setForm({ ...form, metro_retour: e.target.value })} /></Field>
            <div><p className="text-sm font-medium text-neutral-700">Couleur</p><Palette cur={form.color} onPick={(h) => setForm({ ...form, color: h })} /></div>
            <Field label="Contact / téléphone (optionnel)"><input className="field" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label="Notes (horaires, porte d'entrée, etc.)"><textarea className="field min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <p className="text-xs text-neutral-500">Pour une station, choisissez dans la liste ou tapez une adresse complète.</p>
            <div className="flex justify-between gap-2">
              {isSuper && editingId ? <button type="button" className="btn-secondary !text-red-700" onClick={remove} disabled={busy}>Supprimer</button> : <span />}
              <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => setForm(null)}>Annuler</button><button className="btn-primary" disabled={busy}>{busy ? "…" : "Enregistrer"}</button></div>
            </div>
          </form>
        </div>
      )}
      <datalist id="stations">{STATIONS.map((s) => <option key={s} value={s} />)}</datalist>

      {/* ---- Google Maps key dialog ---- */}
      {showKey && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowKey(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card flex w-full max-w-lg flex-col gap-3 p-5">
            <h3 className="text-lg font-semibold">Connexion Google Maps</h3>
            <p className="text-sm text-neutral-600">Sans clé, la carte et l&apos;itinéraire s&apos;affichent quand même et un temps approximatif est calculé. Avec une clé, le temps (avec trafic) et la distance s&apos;affichent directement. La clé reste dans ce navigateur seulement.</p>
            <Field label="Clé API Google Maps"><input className="field" value={keyDraft} placeholder="AIza…" autoComplete="off" onChange={(e) => setKeyDraft(e.target.value)} /></Field>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-600">
              <li>Aller sur <b>console.cloud.google.com</b> et créer un projet.</li>
              <li>Activer <b>Maps JavaScript API</b> et <b>Routes API</b>.</li>
              <li>« Identifiants » → <b>Clé API</b>, puis la coller ici. Limitez-la à <b>app.transportotika.ca</b>.</li>
              <li>Un compte de facturation est requis par Google (crédit mensuel gratuit inclus).</li>
            </ol>
            <div className="flex justify-between gap-2">
              <button className="btn-secondary !text-red-700" onClick={() => { lsDel(KEY_API); mapsPromise = null; setApiKey(""); setMapsFailed(false); setShowKey(false); }}>Retirer la clé</button>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setShowKey(false)}>Annuler</button>
                <button className="btn-primary" onClick={() => {
                  const k = keyDraft.trim(); lsSet(KEY_API, k);
                  // Google Maps cannot swap keys once loaded, so reload to apply the new one.
                  if (k !== apiKey) location.reload(); else setShowKey(false);
                }}>Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-sm font-medium text-neutral-700">{label}</span>{children}</label>;
}

function Palette({ cur, onPick }: { cur: string; onPick: (hex: string) => void }) {
  const sw = ([h, n]: [string, string]) => (
    <button key={h} type="button" title={n} aria-label={n} onClick={() => onPick(h)} className="h-[22px] w-[22px] rounded border border-black/20"
      style={{ background: h, outline: cur.toUpperCase() === h ? "2px solid #1b2430" : undefined, outlineOffset: 1 }} />
  );
  return (
    <div className="mt-1">
      <p className="mb-1 text-[11px] font-semibold text-neutral-500">Couleurs standard</p>
      <div className="flex flex-wrap gap-1.5">{EXCEL_STD.map(sw)}</div>
      <p className="mb-1 mt-2 text-[11px] font-semibold text-neutral-500">Couleurs claires (remplissage)</p>
      <div className="flex flex-wrap gap-1.5">{EXCEL_LIGHT.map(sw)}</div>
      <div className="mt-2 flex items-center gap-3 text-xs">
        <label className="flex items-center gap-2">Personnalisée <input type="color" value={isHexColor(cur) ? cur : "#ffffff"} onChange={(e) => onPick(e.target.value.toUpperCase())} className="h-7 w-9 rounded border border-neutral-300 p-0" /></label>
        <button type="button" className="btn-secondary !min-h-7 !px-2 !text-xs" onClick={() => onPick("")}>Aucune couleur</button>
      </div>
    </div>
  );
}
