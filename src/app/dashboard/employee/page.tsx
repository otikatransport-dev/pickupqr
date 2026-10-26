import { createClient } from "@/lib/supabase/server";

export default async function EmployeePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: employee } = await supabase
    .from("employees")
    .select("name, phone_normalized, qr_image_url, company_id")
    .eq("profile_id", user!.id)
    .maybeSingle();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My QR pass</h1>
      {employee ? (
        <div className="mt-4 max-w-xs card p-4">
          <p className="font-medium">{employee.name}</p>
          <p className="text-sm text-neutral-500">{employee.phone_normalized}</p>
          <p className="mt-3 text-xs text-neutral-400">
            QR image generation is built in the Employee Directory phase.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">
          No directory entry is linked to your account yet — ask your company admin to link it.
        </p>
      )}
    </div>
  );
}
