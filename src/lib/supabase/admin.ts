import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client: bypasses Row Level Security. Server-side only, and only for
 * jobs that have no logged-in user (e.g. the WhatsApp delivery webhook).
 * Anything a signed-in user triggers should use ./server instead so RLS applies.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient must never run in the browser");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
