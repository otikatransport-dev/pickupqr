import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { can } from "@/lib/roles";
import { todayMontreal } from "@/lib/driver-route";
import AttendanceAdmin, { type PersonRow, type AuditEntry } from "./attendance-admin";
import AttendanceSelf from "./attendance-self";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: raw } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!can(me?.role, "attendance_view")) redirect("/unauthorized");

  // Drivers see and clock only their own days. Everyone else who can open this page edits all records.
  if (!can(me?.role, "attendance_edit")) {
    const { data: mine } = await supabase.from("attendance").select("id, work_date, status, check_in, check_out, note").eq("user_id", user.id).order("work_date", { ascending: false }).limit(45);
    return (
      <div>
        <PageHeader title="My attendance" subtitle="Check in when you start and check out when you finish." />
        <AttendanceSelf today={todayMontreal()} records={mine ?? []} />
      </div>
    );
  }

  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayMontreal();
  const [{ data: people }, { data: records }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").eq("active", true).neq("role", "employee").order("full_name"),
    supabase.from("attendance").select("id, user_id, status, check_in, check_out, note, updated_at").eq("work_date", date),
  ]);
  const ids = (records ?? []).map((r) => r.id);
  const { data: audit } = ids.length
    ? await supabase.from("attendance_audit").select("id, attendance_id, action, old_values, new_values, changed_by_name, changed_at").in("attendance_id", ids).order("changed_at", { ascending: false })
    : { data: [] };

  const byUser = new Map((records ?? []).map((r) => [r.user_id, r]));
  const rows: PersonRow[] = (people ?? []).map((p) => {
    const r = byUser.get(p.id);
    return {
      userId: p.id, name: p.full_name || "Unnamed", role: p.role,
      record: r ? { id: r.id, status: r.status, checkIn: r.check_in?.slice(0, 5) ?? "", checkOut: r.check_out?.slice(0, 5) ?? "", note: r.note ?? "" } : null,
    };
  });
  return (
    <div>
      <PageHeader title="Attendance" subtitle="View, correct or backfill any record. Every change keeps the original value, who changed it and when." />
      <AttendanceAdmin date={date} rows={rows} audit={(audit ?? []) as AuditEntry[]} />
    </div>
  );
}
