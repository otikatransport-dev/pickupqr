// One-time bootstrap: creates an auth user and promotes their profile to
// 'super_admin'. Everyone signs up as 'employee' by default (see the
// handle_new_user trigger in the migration) — this script is the only way
// to mint the very first super_admin, since RLS correctly stops anyone
// from promoting themselves.
//
// Usage:
//   node scripts/create-admin.mjs owner@yourcompany.com "a-strong-password"
//
// Requires SUPABASE_SERVICE_ROLE_KEY in your environment (never commit it,
// never ship it to the browser).

import { createClient } from "@supabase/supabase-js";

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.mjs <email> <password>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see .env.example).");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Super Admin", role: "super_admin" },
  });

  if (error) {
    console.error("Failed to create user:", error.message);
    process.exit(1);
  }

  // The handle_new_user trigger reads user_metadata.role at insert time, so
  // this is normally enough. Update explicitly too, in case the trigger
  // hasn't been deployed yet or ran before this metadata was visible.
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role: "super_admin" })
    .eq("id", data.user.id);

  if (updateError) {
    console.error("User created, but promoting to super_admin failed:", updateError.message);
    process.exit(1);
  }

  console.log(`✅ Super admin created: ${email} (id: ${data.user.id})`);
}

main();
