export interface TrackerCompany { id: string; name: string; color: string | null; address: string | null; code: string | null; phone: string | null; contact: string | null }
export type StopStatus = "pending" | "in_progress" | "completed";
export interface TrackerStop { companyId: string; vehicleNumber: string; status: StopStatus }

/** Today's date in Montreal as YYYY-MM-DD (matches the database's app_today()). */
export function todayMontreal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
