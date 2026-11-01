import { parseTable } from "@/lib/csv";

export interface RawEmployeeRow { name: string; phone: string; company: string }

/** Lower-case, no accents, single spaces: "  Élise  Tremblay " -> "elise tremblay". */
export function normText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const NAME_H = /^(name|nom|employee|employe|employé|full ?name|nom complet|prenom nom)/;
const PHONE_H = /^(phone|tel|télé|tele|cell|mobile|numero|numéro|number|whatsapp)/;
const COMPANY_H = /^(company|compagnie|entreprise|societe|société|employer|employeur|client)/;

/** Turns pasted or uploaded cells into {name, phone, company}. Uses the header row when there is one, otherwise column order. */
export function rowsFromText(text: string): RawEmployeeRow[] {
  const table = parseTable(text);
  if (!table.length) return [];
  const head = table[0].map(normText);
  const idx = { name: head.findIndex((h) => NAME_H.test(h)), phone: head.findIndex((h) => PHONE_H.test(h)), company: head.findIndex((h) => COMPANY_H.test(h)) };
  const hasHeader = idx.name >= 0 || idx.phone >= 0 || idx.company >= 0;
  const cols = hasHeader
    ? { name: idx.name >= 0 ? idx.name : 0, phone: idx.phone >= 0 ? idx.phone : 1, company: idx.company >= 0 ? idx.company : 2 }
    : { name: 0, phone: 1, company: 2 };
  return table.slice(hasHeader ? 1 : 0).map((r) => ({ name: r[cols.name] ?? "", phone: r[cols.phone] ?? "", company: r[cols.company] ?? "" }));
}

export type RowStatus = "new" | "exists" | "invalid" | "duplicate" | "company_missing" | "wrong_company";

export interface PreviewRow extends RawEmployeeRow {
  line: number;
  phoneE164: string | null;
  status: RowStatus;
  reason?: string;
  companyId: string | null;   // matched company, if any
  existing?: { id: string; companyId: string | null; companyName: string | null };
}
