import { NextResponse } from "next/server";
import { getAdminCaller } from "@/lib/admin-caller";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWhatsAppNumber } from "@/lib/phone";
import { normText, type PreviewRow, type RawEmployeeRow } from "@/lib/bulk-employees";

/**
 * Bulk employee registration.
 *  mode "preview": checks every row and reports what would happen. Writes nothing.
 *  mode "import" : creates the new employees.
 * Rule: an employee is "already registered" when the same name AND phone number exist (accents, capitals and
 * spacing ignored). Those are never created again, and keep the company they were first given, unless a super
 * admin explicitly asks to move them.
 */
const MAX_ROWS = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (name: string, phone: string) => normText(name) + "|" + phone;
const bad = (status: number, error: string, detail?: string) => NextResponse.json({ ok: false, error, detail }, { status });

async function allEmployees() {
  const admin = createAdminClient();
  const out: { id: string; name: string; phone_normalized: string; company_id: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("employees").select("id, name, phone_normalized, company_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

export async function POST(request: Request) {
  const caller = await getAdminCaller();
  if (!caller.ok) return bad(caller.status, caller.error);
  const c = caller;
  const body = (await request.json().catch(() => null)) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!body || !Array.isArray(body.rows)) return bad(400, "invalid_body");
  if (body.rows.length > MAX_ROWS) return bad(400, "too_many_rows", `Up to ${MAX_ROWS} rows at a time.`);

  const { data: companies } = await c.supabase.from("companies").select("id, name");
  const byName = new Map((companies ?? []).map((co) => [normText(co.name), co]));
  const nameOf = (id: string | null) => (companies ?? []).find((co) => co.id === id)?.name ?? null;

  let existing;
  try { existing = await allEmployees(); } catch (e) { return bad(500, "lookup_failed", (e as Error).message); }
  const have = new Map(existing.map((e) => [key(e.name, e.phone_normalized), e]));

  // ---------------- preview ----------------
  if (body.mode === "preview") {
    const defaultCompanyId = c.isSuper ? (UUID.test(String(body.defaultCompanyId ?? "")) ? String(body.defaultCompanyId) : null) : c.companyId;
    const seen = new Set<string>();
    const rows: PreviewRow[] = (body.rows as RawEmployeeRow[]).map((r, i) => {
      const name = String(r.name ?? "").trim().replace(/\s+/g, " "), phone = String(r.phone ?? "").trim(), company = String(r.company ?? "").trim();
      const digits = toWhatsAppNumber(phone);
      const base = { line: i + 1, name, phone, company, phoneE164: digits ? "+" + digits : null, companyId: null as string | null };
      if (!name) return { ...base, status: "invalid", reason: "Name is missing" };
      if (!digits) return { ...base, status: "invalid", reason: "Phone number is not valid" };

      let companyId: string | null = null;
      if (company) companyId = byName.get(normText(company))?.id ?? null;
      else companyId = defaultCompanyId;
      if (!c.isSuper && company && companyId !== c.companyId) return { ...base, status: "wrong_company", reason: "This company is not yours" };
      if (!c.isSuper) companyId = c.companyId;

      const k = key(name, "+" + digits);
      const dup = have.get(k);
      if (dup) {
        const visible = c.isSuper || dup.company_id === c.companyId;
        return { ...base, companyId, status: "exists", reason: "Already registered", existing: { id: dup.id, companyId: visible ? dup.company_id : null, companyName: visible ? nameOf(dup.company_id) : null } };
      }
      if (seen.has(k)) return { ...base, companyId, status: "duplicate", reason: "Repeated in this list" };
      seen.add(k);
      if (!companyId) return { ...base, status: "company_missing", reason: company ? `Company “${company}” does not exist yet` : "No company chosen" };
      return { ...base, companyId, status: "new" };
    });
    return NextResponse.json({ ok: true, rows });
  }

  // ---------------- import ----------------
  if (body.mode !== "import") return bad(400, "invalid_mode");
  const result = { created: 0, alreadyRegistered: 0, moved: 0, companiesCreated: 0, failed: [] as { line: number; name: string; reason: string }[] };
  const createdCompanies = new Map<string, string>(); // normalized name -> id

  async function companyFor(r: { companyId?: string; createCompany?: string }): Promise<string | null> {
    if (r.companyId && UUID.test(r.companyId)) {
      if (!c.isSuper && r.companyId !== c.companyId) return null;
      return (companies ?? []).some((co) => co.id === r.companyId) || createdCompanies.has(r.companyId) ? r.companyId : null;
    }
    const nm = String(r.createCompany ?? "").trim();
    if (!nm || !c.isSuper) return null;
    const n = normText(nm);
    const found = byName.get(n)?.id ?? createdCompanies.get(n);
    if (found) return found;
    const { data, error } = await c.supabase.from("companies").insert({ name: nm }).select("id").single();
    if (error || !data) return null;
    createdCompanies.set(n, data.id); result.companiesCreated++;
    return data.id;
  }

  const toInsert: { name: string; phone_normalized: string; company_id: string }[] = [];
  const inserted = new Set<string>();
  for (const [i, r] of (body.rows as any[]).entries()) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const name = String(r.name ?? "").trim().replace(/\s+/g, " ");
    const digits = toWhatsAppNumber(String(r.phone ?? ""));
    const line = Number(r.line) || i + 1;
    if (!name || !digits) { result.failed.push({ line, name, reason: "Name or phone is not valid" }); continue; }
    const k = key(name, "+" + digits);
    const dup = have.get(k);
    if (dup) {
      result.alreadyRegistered++;
      if (r.move && r.companyId) {
        const target = await companyFor(r);
        if (target && target !== dup.company_id) {
          const { data, error } = await c.supabase.from("employees").update({ company_id: target }).eq("id", dup.id).select("id");
          if (!error && data?.length) { result.moved++; } else result.failed.push({ line, name, reason: "You are not allowed to move this employee" });
        }
      }
      continue;
    }
    if (inserted.has(k)) { result.alreadyRegistered++; continue; }
    const companyId = await companyFor(r);
    if (!companyId) { result.failed.push({ line, name, reason: "No valid company" }); continue; }
    inserted.add(k);
    toInsert.push({ name, phone_normalized: "+" + digits, company_id: companyId });
  }
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200);
    const { data, error } = await c.supabase.from("employees").upsert(chunk, { onConflict: "name,phone_normalized", ignoreDuplicates: true }).select("id");
    if (error) { for (const r of chunk) result.failed.push({ line: 0, name: r.name, reason: error.message }); continue; }
    result.created += data?.length ?? 0;
    result.alreadyRegistered += chunk.length - (data?.length ?? 0);
  }
  return NextResponse.json({ ok: true, result });
}
