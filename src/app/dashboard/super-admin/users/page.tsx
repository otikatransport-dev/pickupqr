import { getAdminContext } from "@/lib/admin-context";
import { PageHeader } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import UsersManager, { type UserRow, type AuditRow } from "./users-manager";

export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const { supabase, user, role } = await getAdminContext("users");
  const [{ data: profiles, error }, { data: log }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, role, active, avatar_url").neq("role", "employee").order("full_name"),
    supabase.from("role_audit_log").select("id, target_name, changed_by_name, action, old_role, new_role, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const emails = new Map<string, string>();
  try {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) if (u.email) emails.set(u.id, u.email);
  } catch { /* emails stay blank if the service key is missing */ }

  const rows: UserRow[] = (profiles ?? []).map((p) => ({
    id: p.id, name: p.full_name || "Unnamed", email: emails.get(p.id) ?? "", phone: p.phone, role: p.role,
    active: p.active !== false, avatar: p.avatar_url,
  }));
  return (
    <div>
      <PageHeader title="Users & roles" subtitle="Create logins, assign roles, deactivate accounts. Nothing is ever deleted, so history is kept." />
      <UsersManager initial={rows} audit={(log ?? []) as AuditRow[]} meId={user.id} meRole={role ?? "manager"} loadError={error?.message ?? null} />
    </div>
  );
}
