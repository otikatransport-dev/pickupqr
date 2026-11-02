import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWhatsAppNumber } from "@/lib/phone";
import { can, LOGIN_ROLES } from "@/lib/roles";

/**
 * User management (Admin Centre → Users & roles). Needs the service-role key (Supabase Auth admin API),
 * so it only ever runs here on the server. Only a super admin or a manager may call it (403 otherwise).
 *
 *  - Roles that can be given: super_admin, manager, admin_hr, recruiter, driver.
 *  - Only a super admin may create, change or deactivate a super admin; a manager cannot.
 *  - Nobody can change their own role or deactivate themselves (no lock-outs).
 *  - Accounts are never hard-deleted: they are deactivated (and can be reactivated), so history is kept.
 *  - Every create / role change / deactivate / reactivate is written to the role_audit_log table.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Role = (typeof LOGIN_ROLES)[number];
const isRole = (v: unknown): v is Role => typeof v === "string" && (LOGIN_ROLES as readonly string[]).includes(v);

const fail = (status: number, error: string, detail?: string) =>
  NextResponse.json({ ok: false, error, ...(detail ? { detail } : {}) }, { status });

async function caller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: fail(401, "not_signed_in") } as const;
  const { data: me } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!can(me?.role, "users")) return { error: fail(403, "forbidden") } as const;
  return { user, role: me!.role as string, name: me!.full_name as string | null } as const;
}

/** A manager may not give out, or touch, the super admin role. */
const mayAssign = (callerRole: string, role: Role) => role !== "super_admin" || callerRole === "super_admin";
const mayTouch = (callerRole: string, targetRole: string) => targetRole !== "super_admin" || callerRole === "super_admin";

type Admin = ReturnType<typeof createAdminClient>;
async function audit(admin: Admin, row: { target_id: string; target_name: string | null; changed_by: string; changed_by_name: string | null; action: "create" | "role_change" | "deactivate" | "reactivate"; old_role?: string | null; new_role?: string | null }) {
  await admin.from("role_audit_log").insert(row); // best effort: a missing log table must not undo the change
}

export async function POST(request: Request) {
  const c = await caller();
  if ("error" in c) return c.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, "invalid_json");

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim();
  const phoneRaw = String(body.phone ?? "").trim();
  const role = body.role;
  if (!isRole(role)) return fail(400, "invalid_role");
  const isDriver = role === "driver";

  if (!EMAIL.test(email) || email.length > 200) return fail(400, "invalid_email");
  if (password.length < 8 || password.length > 72) return fail(400, "invalid_password", "Use 8 to 72 characters.");
  if (!fullName || fullName.length > 100) return fail(400, "invalid_name");
  const digits = toWhatsAppNumber(phoneRaw);
  if (isDriver && !digits) return fail(400, "invalid_phone", "A valid phone number is required.");
  if (!isDriver && phoneRaw && !digits) return fail(400, "invalid_phone");
  const phone = digits ? "+" + digits : null;
  if (!mayAssign(c.role, role)) return fail(403, "forbidden_role");

  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, role } });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? "Could not create the user";
    const exists = /already|registered|exists/i.test(msg);
    return fail(exists ? 409 : 502, exists ? "email_taken" : "create_failed", exists ? undefined : msg);
  }
  const userId = created.data.user.id;

  // The signup trigger made the profile row; fill in the phone and role, then the driver row.
  const rollback = async (detail: string) => {
    await admin.auth.admin.deleteUser(userId); // only for an account that has just been created and has no history
    return fail(500, "setup_failed", detail);
  };
  const prof = await admin.from("profiles").update({ company_id: null, phone, full_name: fullName, role }).eq("id", userId);
  if (prof.error) return rollback(prof.error.message);
  if (isDriver) {
    const drv = await admin.from("drivers").insert({ profile_id: userId, company_id: null, vehicle_number: null, phone });
    if (drv.error) return rollback(drv.error.message);
  }
  await audit(admin, { target_id: userId, target_name: fullName, changed_by: c.user.id, changed_by_name: c.name, action: "create", new_role: role });
  return NextResponse.json({ ok: true, userId });
}

export async function PATCH(request: Request) {
  const c = await caller();
  if ("error" in c) return c.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, "invalid_json");

  const userId = String(body.userId ?? "");
  if (!UUID.test(userId)) return fail(400, "invalid_user");
  const isSelf = userId === c.user.id;

  // Any of these may be sent; only the ones present are changed.
  const has = (k: string) => body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== "";
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const digits = toWhatsAppNumber(String(body.phone ?? "").trim());
  if (body.fullName !== undefined && (!fullName || fullName.length > 100)) return fail(400, "invalid_name");
  if (has("email") && (!EMAIL.test(email) || email.length > 200)) return fail(400, "invalid_email");
  if (has("password") && (password.length < 8 || password.length > 72)) return fail(400, "invalid_password", "Use 8 to 72 characters.");
  if (body.phone !== undefined && !digits) return fail(400, "invalid_phone", "A valid phone number is required.");
  const newRole = body.role;
  if (newRole !== undefined && !isRole(newRole)) return fail(400, "invalid_role");
  const newActive = body.active;
  if (newActive !== undefined && typeof newActive !== "boolean") return fail(400, "invalid_active");

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role, full_name, phone, active").eq("id", userId).maybeSingle();
  if (!target) return fail(404, "not_found");
  if (!mayTouch(c.role, target.role)) return fail(403, "forbidden");
  if (isRole(newRole) && newRole !== target.role && !mayAssign(c.role, newRole)) return fail(403, "forbidden_role");
  if (isSelf && ((isRole(newRole) && newRole !== target.role) || newActive === false)) return fail(400, "cannot_target_self");
  const targetName = fullName || target.full_name;

  if (has("email") || has("password")) {
    const res = await admin.auth.admin.updateUserById(userId, { ...(has("email") ? { email, email_confirm: true } : {}), ...(has("password") ? { password } : {}) });
    if (res.error) {
      const exists = /already|registered|exists/i.test(res.error.message);
      return fail(exists ? 409 : 502, exists ? "email_taken" : "update_failed", exists ? undefined : res.error.message);
    }
  }

  const patch: { full_name?: string; phone?: string; role?: Role; active?: boolean } = {};
  if (body.fullName !== undefined) patch.full_name = fullName;
  if (digits) patch.phone = "+" + digits;
  const roleChanged = isRole(newRole) && newRole !== target.role;
  if (roleChanged) patch.role = newRole as Role;
  const activeChanged = typeof newActive === "boolean" && newActive !== target.active;
  if (activeChanged) patch.active = newActive as boolean;

  // Reactivate: lift the sign-in ban before the profile comes back to life.
  if (activeChanged && newActive === true) {
    const r = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    if (r.error) return fail(502, "update_failed", r.error.message);
  }
  if (Object.keys(patch).length) {
    const p = await admin.from("profiles").update(patch).eq("id", userId);
    if (p.error) return fail(500, "update_failed", p.error.message);
  }
  // Deactivate: the profile flag already blocks everything in the app; the ban also stops new sign-ins.
  if (activeChanged && newActive === false) {
    const r = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    if (r.error) return fail(502, "update_failed", r.error.message);
  }

  const finalRole = (roleChanged ? newRole : target.role) as string;
  if (finalRole === "driver" && (roleChanged || patch.phone)) {
    // A driver needs a drivers row (WhatsApp number, planning, routes).
    const phone = patch.phone ?? target.phone;
    const { data: row } = await admin.from("drivers").select("id").eq("profile_id", userId).maybeSingle();
    if (row) { if (patch.phone) await admin.from("drivers").update({ phone: patch.phone }).eq("profile_id", userId); }
    else await admin.from("drivers").insert({ profile_id: userId, company_id: null, vehicle_number: null, phone });
  }

  const log = { target_id: userId, target_name: targetName, changed_by: c.user.id, changed_by_name: c.name } as const;
  if (roleChanged) await audit(admin, { ...log, action: "role_change", old_role: target.role, new_role: newRole as string });
  if (activeChanged) await audit(admin, { ...log, action: newActive ? "reactivate" : "deactivate", old_role: target.role, new_role: finalRole });
  return NextResponse.json({ ok: true });
}
