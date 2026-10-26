import { toWhatsAppNumber } from "../phone";

export interface DriverLite {
  id: string;
  name: string;
  phone: string | null;
}

/** "José  Pérez-López" -> "JOSE PEREZ LOPEZ" */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]+/g, " ")
    .trim();
}

/**
 * Picks the driver a sheet column belongs to, from the name / phone read off the
 * column header. Returns null unless exactly one driver fits, so a wrong guess
 * can never silently send someone else's planning.
 *
 * Order: phone number, then full name, then first name.
 */
export function matchDriver(sheetName: string, sheetPhone: string, drivers: DriverLite[]): string | null {
  const phone = toWhatsAppNumber(sheetPhone);
  if (phone) {
    const byPhone = drivers.filter((d) => toWhatsAppNumber(d.phone) === phone);
    if (byPhone.length === 1) return byPhone[0].id;
  }

  const name = normalizeName(sheetName);
  if (!name) return null;

  const full = drivers.filter((d) => normalizeName(d.name) === name);
  if (full.length === 1) return full[0].id;
  if (full.length > 1) return null;

  const first = drivers.filter((d) => normalizeName(d.name).split(" ")[0] === name);
  return first.length === 1 ? first[0].id : null;
}
