"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Label, Notice } from "@/components/ui";
import { rowsFromText, type PreviewRow, type RowStatus } from "@/lib/bulk-employees";

interface Co { id: string; name: string }
interface Row extends PreviewRow { include: boolean; chosen: string; move: boolean }
interface Result { created: number; alreadyRegistered: number; moved: number; companiesCreated: number; failed: { line: number; name: string; reason: string }[] }
type Source = "paste" | "file" | "sheet";
const NEW_CO = "__new__";

const BADGE: Record<RowStatus, { text: string; cls: string }> = {
  new: { text: "New", cls: "bg-emerald-100 text-emerald-800" },
  exists: { text: "Already registered", cls: "bg-neutral-200 text-neutral-700" },
  invalid: { text: "Invalid", cls: "bg-red-100 text-red-800" },
  duplicate: { text: "Repeated", cls: "bg-neutral-200 text-neutral-700" },
  company_missing: { text: "Company needed", cls: "bg-amber-100 text-amber-900" },
  wrong_company: { text: "Not your company", cls: "bg-red-100 text-red-800" },
};

export default function BulkEmployees({ companies, isSuper, ownCompanyId }: { companies: Co[]; isSuper: boolean; ownCompanyId: string | null }) {
  const [source, setSource] = useState<Source>("paste");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [defaultCompany, setDefaultCompany] = useState(ownCompanyId ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function post(url: string, payload: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => null);
    return { ok: res.ok && json?.ok, json };
  }

  async function check(raw: string) {
    const parsed = rowsFromText(raw);
    if (!parsed.length) { setMsg({ kind: "error", text: "No rows found. Each row needs a name, a phone number and (optionally) a company." }); return; }
    if (parsed.length > 1000) { setMsg({ kind: "error", text: "Please import up to 1000 rows at a time." }); return; }
    const { ok, json } = await post("/api/admin/employees/bulk", { mode: "preview", rows: parsed, defaultCompanyId: defaultCompany });
    if (!ok) { setMsg({ kind: "error", text: json?.detail ?? "Could not check the list." }); return; }
    setRows((json.rows as PreviewRow[]).map((r) => ({
      ...r, include: r.status === "new" || r.status === "company_missing",
      chosen: r.companyId ?? (r.status === "company_missing" && r.company && isSuper ? NEW_CO : ""), move: false,
    })));
  }

  async function onCheck() {
    setBusy(true); setMsg(null); setResult(null);
    try {
      if (source === "sheet") {
        const { ok, json } = await post("/api/admin/employees/sheet", { url: link.trim() });
        if (!ok) { setMsg({ kind: "error", text: json?.detail ?? "Could not read the sheet." }); return; }
        await check(json.csv);
      } else await check(text);
    } finally { setBusy(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (f) setText(await f.text());
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const ready = (rows ?? []).filter((r) => r.include && ((r.status === "new" && r.chosen) || (r.status === "company_missing" && r.chosen)) && r.chosen !== "").length;
  const moves = (rows ?? []).filter((r) => r.status === "exists" && r.move && r.chosen && r.chosen !== r.existing?.companyId).length;

  async function onImport() {
    if (!rows) return;
    setBusy(true); setMsg(null);
    const payload = rows
      .filter((r) => (r.include && (r.status === "new" || r.status === "company_missing")) || (r.status === "exists" && r.move))
      .map((r) => ({
        line: r.line, name: r.name, phone: r.phone, move: r.status === "exists" && r.move,
        companyId: r.chosen && r.chosen !== NEW_CO ? r.chosen : undefined,
        createCompany: r.chosen === NEW_CO ? r.company : undefined,
      }));
    const { ok, json } = await post("/api/admin/employees/bulk", { mode: "import", rows: payload });
    setBusy(false);
    if (!ok) { setMsg({ kind: "error", text: json?.detail ?? "Import failed." }); return; }
    setResult(json.result as Result); setRows(null); setText(""); setLink("");
  }

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        <Notice kind="ok">
          Done. {result.created} new employee{result.created === 1 ? "" : "s"} added
          {result.alreadyRegistered ? `, ${result.alreadyRegistered} already registered (left unchanged)` : ""}
          {result.moved ? `, ${result.moved} moved to another company` : ""}
          {result.companiesCreated ? `, ${result.companiesCreated} new compan${result.companiesCreated === 1 ? "y" : "ies"} created` : ""}.
        </Notice>
        {result.failed.length > 0 && (
          <div className="card p-4 text-sm">
            <p className="font-semibold text-red-700">{result.failed.length} row(s) could not be added</p>
            <ul className="mt-1 list-disc pl-5 text-neutral-600">{result.failed.slice(0, 30).map((f, i) => <li key={i}>{f.name || "Row " + f.line}: {f.reason}</li>)}</ul>
          </div>
        )}
        <div className="flex gap-2">
          <Link href="/dashboard/company-admin/employees" className="btn-primary">View employees</Link>
          <button className="btn-secondary" onClick={() => setResult(null)}>Add more</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {!rows && (
        <div className="card flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            {([["paste", "Paste from Google Sheets"], ["file", "Upload a CSV file"], ["sheet", "Google Sheet link"]] as [Source, string][]).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={source === k} onClick={() => setSource(k)} className={source === k ? "btn-primary !min-h-9 !px-3" : "btn-secondary !min-h-9 !px-3"}>{t}</button>
            ))}
          </div>

          {source === "paste" && (
            <Label label="Paste your rows" hint="In Google Sheets or Excel, select the cells (Name, Phone, Company), copy, and paste here. A header row is detected automatically.">
              <textarea className="field min-h-[180px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Name\tPhone\tCompany\nMarie Tremblay\t514 555 0101\tBanque Nationale"} />
            </Label>
          )}
          {source === "file" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-neutral-600">In Google Sheets choose <b>File → Download → Comma-separated values (.csv)</b>, then upload it here.</p>
              <div><button className="btn-secondary" onClick={() => fileRef.current?.click()}>Choose .csv file…</button><input ref={fileRef} type="file" accept=".csv,text/csv,text/plain,.tsv" className="hidden" onChange={onFile} /></div>
              {text && <p className="text-sm text-emerald-700">File loaded ({text.split("\n").length} lines). Click “Check the list”.</p>}
            </div>
          )}
          {source === "sheet" && (
            <Label label="Google Sheet link" hint="Open the sheet → Share → General access → “Anyone with the link” → Viewer, then paste the link. To read a specific tab, open that tab first so its address ends in #gid=…">
              <input className="field" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
            </Label>
          )}

          {isSuper && (
            <Label label="Company for rows with no company" hint="Rows that name a company use that company. Blank rows use this one.">
              <select className="field" value={defaultCompany} onChange={(e) => setDefaultCompany(e.target.value)}>
                <option value="">— none —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Label>
          )}
          <p className="text-xs text-neutral-500">Columns: <b>Name</b>, <b>Phone</b>, <b>Company</b>. Someone is “already registered” when the same name and phone number exist. They are never created twice and keep their first company.</p>
          <div><button className="btn-primary" disabled={busy || (source === "sheet" ? !link.trim() : !text.trim())} onClick={onCheck}>{busy ? "Checking…" : "Check the list"}</button></div>
        </div>
      )}

      {rows && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {(Object.keys(BADGE) as RowStatus[]).filter((s) => counts[s]).map((s) => <span key={s} className={`rounded-full px-3 py-1 text-xs font-medium ${BADGE[s].cls}`}>{counts[s]} {BADGE[s].text.toLowerCase()}</span>)}
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs text-neutral-500">
                <tr><th className="p-2">Add</th><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">Company</th><th className="p-2">Result</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const addable = r.status === "new" || r.status === "company_missing";
                  return (
                    <tr key={i} className="border-b border-neutral-100 align-top">
                      <td className="p-2">{addable && <input type="checkbox" checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={"Add " + r.name} />}</td>
                      <td className="p-2 font-medium">{r.name || <span className="text-red-700">—</span>}</td>
                      <td className="p-2">{r.phoneE164 ?? r.phone}</td>
                      <td className="p-2">
                        {r.status === "exists" ? (
                          <div className="flex flex-col gap-1">
                            <span>{r.existing?.companyName ?? "Registered"}</span>
                            {isSuper && (
                              <label className="flex items-center gap-1 text-xs text-neutral-600">
                                <input type="checkbox" checked={r.move} onChange={(e) => update(i, { move: e.target.checked, chosen: r.chosen || r.companyId || "" })} /> Move to:
                                <select className="field !min-h-7 !py-0 text-xs" value={r.chosen} disabled={!r.move} onChange={(e) => update(i, { chosen: e.target.value })}>
                                  <option value="">—</option>
                                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </label>
                            )}
                          </div>
                        ) : addable && isSuper ? (
                          <select className="field !min-h-8 !py-0 text-sm" value={r.chosen} onChange={(e) => update(i, { chosen: e.target.value })}>
                            <option value="">— choose —</option>
                            {r.company && !r.companyId && <option value={NEW_CO}>+ Create “{r.company}”</option>}
                            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-neutral-600">{companies.find((c) => c.id === r.companyId)?.name ?? r.company}</span>
                        )}
                      </td>
                      <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[r.status].cls}`}>{BADGE[r.status].text}</span>{r.reason && r.status !== "exists" && r.status !== "new" && <p className="mt-0.5 text-xs text-neutral-500">{r.reason}</p>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={busy || (ready === 0 && moves === 0)} onClick={onImport}>
              {busy ? "Importing…" : ready ? `Add ${ready} employee${ready === 1 ? "" : "s"}${moves ? ` and move ${moves}` : ""}` : moves ? `Move ${moves}` : "Nothing to add"}
            </button>
            <button className="btn-secondary" onClick={() => setRows(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}
