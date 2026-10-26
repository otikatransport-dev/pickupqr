import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/database.types";

/**
 * Admin Centre: create / reset / delete login accounts for drivers and company admins.
 * Needs the service-role key (Supabase Auth admin API), so it only ever runs here on the
 * server, and only for a signed-in super admin or company admin:
 *  - super admin: may manage drivers and company admins in any company
 *  - company admin: may manage drivers in their OWN company only
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MANAGEABLE: AppRole[] = ["driver", "company_admin"];

const fail = (status: number, error: string, detail?: string) =>
  NextResponse.json({ ok: false, error, ...(detail ? { detail } : {}) }, { status });

async function caller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: fail(401, "not_signed_in") } as const;
  const { data: me } = await supabase.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (me?.role !== "super_admin" && me?.role !== "company_admin") return { error: fail(403, "forbidden") } as const;
  return { user, role: me.role as AppRole, companyId: me.company_id as string | null } as const;
}

/** May this caller manage a user with this role in this company? */
function mayManage(c: { role: AppRole; companyId: string | null }, targetRole: AppRole, targetCompany: string | null) {
  if (!MANAGEABLE.includes(targetRole)) return false;
  if (c.role === "super_admin") return true;
  return c.role === "company_admin" && targetRole === "driver" && !!c.companyId && c.companyId === targetCompany;
}

export async function POST(request: Request) {
  const c = await caller();
  if ("error" in c) return c.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_json");
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim() || null;
  const vehicle = String(body.vehicleNumber ?? "").trim() || null;
  const role = String(body.role ?? "") as AppRole;
  const companyId = String(body.companyId ?? "");

  if (!EMAIL.test(email) || email.length > 200) return fail(400, "invalid_email");
  if (password.length < 8 || password.length > 72) return fail(400, "invalid_password", "Use 8 to 72 characters.");
  if (!fullName || fullName.length > 100) return fail(400, "invalid_name");
  if (phone && phone.length > 30) return fail(400, "invalid_phone");
  if (vehicle && vehicle.length > 30) return fail(400, "invalid_vehicle");
  if (!UUID.test(companyId)) return fail(400, "company_required");
  if (!mayManage(c, role, companyId)) return fail(403, "forbidden");

  const admin = createAdminClient();
  const { data: company } = await admin.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (!company) return fail(400, "company_not_found");

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? "Could not create the user";
    const exists = /already|registered|exists/i.test(msg);
    return fail(exists ? 409 : 502, exists ? "email_taken" : "create_failed", exists ? undefined : msg);
  }
  const userId = created.data.user.id;

  // The signup trigger made the profile row; fill in company + phone, then the driver row.
  const rollback = async (detail: string) => {
    await admin.auth.admin.deleteUser(userId); // cascades to profile + driver rows
    return fail(500, "setup_failed", detail);
  };
  const prof = await admin.from("profiles").update({ company_id: companyId, phone, full_name: fullName, role }).eq("id", userId);
  if (prof.error) return rollback(prof.error.message);
  if (role === "driver") {
    const drv = await admin.from("drivers").insert({ profile_id: userId, company_id: companyId, vehicle_number: vehicle, phone });
    if (drv.error) return rollback(drv.error.message);
  }
  return NextResponse.json({ ok: true, userId });
}

/** Look up the target the caller wants to act on, and check they are allowed to. */
async function authorizeTarget(userId: string) {
  const c = await caller();
  if (c.error) return { error: c.error } as const;
  if (!UUID.test(userId)) return { error: fail(400, "invalid_user") } as const;
  if (userId === c.user.id) return { error: fail(400, "cannot_target_self") } as const;
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role, company_id").eq("id", userId).maybeSingle();
  if (!target) return { error: fail(404, "not_found") } as const;
  if (!mayManage(c, target.role as AppRole, target.company_id)) return { error: fail(403, "forbidden") } as const;
  return { admin } as const;
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const password = String(body.password ?? "");
  if (password.length < 8 || password.length > 72) return fail(400, "invalid_password", "Use 8 to 72 characters.");
  const a = await authorizeTarget(String(body.userId ?? ""));
  if ("error" in a) return a.error;
  const res = await a.admin.auth.admin.updateUserById(String(body.userId), { password });
  if (res.error) return fail(502, "update_failed", res.error.message);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const a = await authorizeTarget(String(body.userId ?? ""));
  if ("error" in a) return a.error;
  const res = await a.admin.auth.admin.deleteUser(String(body.userId));
  if (res.error) return fail(502, "delete_failed", res.error.message);
  return NextResponse.json({ ok: true });
}
