/** Pure helpers for the Route Optimizer (no React, no browser APIs except where noted). */

export const STATIONS = ["Angrignon","Monk","Jolicoeur","Verdun","De l'Église","LaSalle","Charlevoix","Lionel-Groulx","Atwater","Guy-Concordia","Peel","McGill","Place-des-Arts","Saint-Laurent","Berri-UQAM","Beaudry","Papineau","Frontenac","Préfontaine","Joliette","Pie-IX","Viau","Assomption","Cadillac","Langelier","Radisson","Honoré-Beaugrand","Côte-Vertu","Du Collège","De la Savane","Namur","Plamondon","Côte-Sainte-Catherine","Snowdon","Villa-Maria","Vendôme","Place-Saint-Henri","Georges-Vanier","Lucien-L'Allier","Bonaventure","Square-Victoria–OACI","Place-d'Armes","Champ-de-Mars","Sherbrooke","Mont-Royal","Laurier","Rosemont","Beaubien","Jean-Talon","Jarry","Crémazie","Sauvé","Henri-Bourassa","Cartier","De la Concorde","Montmorency","Jean-Drapeau","Longueuil–Université-de-Sherbrooke","Côte-des-Neiges","Université-de-Montréal","Édouard-Montpetit","Outremont","Acadie","Parc","De Castelnau","Fabre","D'Iberville","Saint-Michel"];

export const EXCEL_STD: [string, string][] = [["#C00000","Rouge foncé"],["#FF0000","Rouge"],["#FFC000","Orange"],["#FFFF00","Jaune"],["#92D050","Vert clair"],["#00B050","Vert"],["#00B0F0","Bleu clair"],["#0070C0","Bleu"],["#002060","Bleu foncé"],["#7030A0","Violet"]];
export const EXCEL_LIGHT: [string, string][] = [["#F2F2F2","Gris clair"],["#FCE4D6","Orange pâle"],["#F8CBAD","Orange clair"],["#FFF2CC","Or pâle"],["#FFE699","Or clair"],["#E2EFDA","Vert pâle"],["#C6E0B4","Vert clair"],["#DDEBF7","Bleu pâle"],["#BDD7EE","Bleu clair"],["#E4DFEC","Violet pâle"]];

export interface RouteRes { dur: number; dist: number; stat?: number; poly?: string; approx?: boolean }
export interface Leg { from: string; to: string }

/** "Lionel-Groulx" -> "Métro Lionel-Groulx, Montréal, QC"; a full address is left as typed. */
export function stationAddr(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (/,|\d/.test(t)) return t;
  if (/^(métro|metro|station)\b/i.test(t)) return t + ", Montréal, QC";
  return "Métro " + t + ", Montréal, QC";
}

export function legsOf(c: { address: string | null; metro_aller: string | null; metro_retour: string | null }): { aller: Leg; retour: Leg } {
  const addr = (c.address ?? "").trim();
  return {
    aller: { from: stationAddr(c.metro_aller), to: addr },
    retour: { from: addr, to: stationAddr(c.metro_retour) },
  };
}

export function gmLink(o: string, d: string, waypoint?: string): string {
  return "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(o) + "&destination=" + encodeURIComponent(d) +
    (waypoint ? "&waypoints=" + encodeURIComponent(waypoint) : "") + "&travelmode=driving";
}

export function fmtDur(s: number | null | undefined): string {
  if (s == null || Number.isNaN(s)) return "—";
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0");
}

export function fmtDist(m: number | null | undefined): string {
  if (m == null) return "";
  return m >= 1000 ? (m / 1000).toFixed(1).replace(".", ",") + " km" : m + " m";
}

export const legKey = (l: Leg) => l.from + "→" + l.to;

export function textOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#000";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1b2430" : "#fff";
}

// ---------- Approximate time without a Google key (OpenStreetMap + OSRM) ----------
type Pt = { lat: number; lon: number };
const geoCache: Record<string, Pt> = {};
let nomQueue: Promise<unknown> = Promise.resolve();

function nominatim(q: string): Promise<Array<Record<string, string>>> {
  // OpenStreetMap asks for at most 1 request per second.
  const run = async () => {
    const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ca&accept-language=fr&viewbox=-74.4,46.0,-72.6,45.1&q=" + encodeURIComponent(q);
    const r = await fetch(u, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  };
  const p = nomQueue.then(run);
  nomQueue = p.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, 1100)));
  return p;
}

async function geocode(text: string): Promise<Pt> {
  if (geoCache[text]) return geoCache[text];
  let queries: string[];
  let isStation = false;
  const m = text.match(/^(?:métro|metro|station)\s+(.+?)(?:,\s*Montréal,\s*QC)?$/i);
  if (m) {
    isStation = true;
    const n = m[1].replace(/^(?:métro|metro|station)\s+/i, "");
    queries = ["Station " + n, n + " station", n + ", Québec"];
  } else {
    const noPostal = text.replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i, "").replace(/,\s*,/g, ",").replace(/[,\s]+$/, "");
    queries = [text, noPostal, noPostal.replace(/^\s*\d+[-\w]*\s+/, "")];
  }
  for (const q of new Set(queries)) {
    let res: Array<Record<string, string>>;
    try { res = await nominatim(q); } catch { continue; }
    if (!res?.length) continue;
    const pick = isStation
      ? res.find((x) => /railway|public_transport/.test(x.category || x.class || "") || /station|subway/.test(x.type || "")) ?? res[0]
      : res[0];
    const pt = { lat: +pick.lat, lon: +pick.lon };
    geoCache[text] = pt;
    return pt;
  }
  throw new Error("adresse introuvable");
}

export async function computeApprox(o: string, d: string): Promise<RouteRes> {
  const A = await geocode(o), B = await geocode(d);
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=false`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== "Ok" || !j.routes?.length) throw new Error("trajet introuvable");
  return { dur: Math.round(j.routes[0].duration), dist: Math.round(j.routes[0].distance), approx: true };
}

// ---------- Google Routes API (with traffic), needs the person's own API key ----------
export async function computeRoute(o: string, d: string, apiKey: string): Promise<RouteRes> {
  const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({ origin: { address: o }, destination: { address: d }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", languageCode: "fr-CA", regionCode: "CA", units: "METRIC" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message?.slice(0, 90) || "HTTP " + r.status);
  const t = j.routes?.[0];
  if (!t) throw new Error("aucun trajet trouvé");
  return { dur: parseInt(t.duration), stat: parseInt(t.staticDuration || t.duration), dist: t.distanceMeters, poly: t.polyline?.encodedPolyline };
}
