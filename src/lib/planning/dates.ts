/**
 * Plan dates are plain calendar dates ("2026-10-27") in the company's time zone, not
 * instants. Servers run in UTC, so "today" must be computed for the company's zone or
 * an evening upload in Montréal would be filed under the wrong day.
 */
export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "America/Toronto";

/** Today's date in the company time zone, as yyyy-mm-dd. */
export function todayISO(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  return now.toLocaleDateString("en-CA", { timeZone });
}

/** Adds whole days to a yyyy-mm-dd date (calendar arithmetic, no time zone involved). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** "2026-10-27" -> "Tuesday, October 27" */
export function formatPlanDate(iso: string, locale = "en-CA"): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
