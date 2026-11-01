import { NextResponse } from "next/server";
import { getAdminCaller } from "@/lib/admin-caller";

/**
 * Reads a Google Sheet that is shared as "Anyone with the link can view" and returns it as CSV text.
 * We build the Google URL ourselves from the sheet id, so this cannot be used to fetch any other address.
 */
export async function POST(request: Request) {
  const c = await getAdminCaller();
  if (!c.ok) return NextResponse.json({ ok: false, error: c.error }, { status: c.status });

  const body = (await request.json().catch(() => ({}))) as { url?: string };
  const link = String(body.url ?? "");
  const m = link.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) return NextResponse.json({ ok: false, error: "bad_link", detail: "Paste the full Google Sheets link (it starts with https://docs.google.com/spreadsheets/d/…)." }, { status: 400 });
  const gid = link.match(/[#?&]gid=(\d{1,12})/)?.[1] ?? "0";

  let res: Response;
  try {
    res = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    return NextResponse.json({ ok: false, error: "unreachable", detail: "Could not reach Google Sheets. Try again, or paste the cells instead." }, { status: 502 });
  }
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("csv")) {
    return NextResponse.json({ ok: false, error: "not_shared", detail: "Google would not share this sheet. In Google Sheets click Share → General access → “Anyone with the link” → Viewer, then try again." }, { status: 422 });
  }
  const csv = await res.text();
  if (csv.length > 2_000_000) return NextResponse.json({ ok: false, error: "too_big", detail: "That sheet is too large." }, { status: 413 });
  return NextResponse.json({ ok: true, csv });
}
