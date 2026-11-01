import { createClient } from "@/lib/supabase/server";
import QrImage from "@/components/qr-image";

export default async function EmployeePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: employee } = await supabase
    .from("employees")
    .select("name, phone_normalized, qr_token, qr_generated_at")
    .eq("profile_id", user!.id)
    .maybeSingle();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My QR pass</h1>
      {employee ? (
        <div className="card mt-4 flex max-w-xs flex-col items-center p-4 text-center">
          <p className="font-medium">{employee.name}</p>
          <p className="text-sm text-neutral-500">{employee.phone_normalized}</p>
          {employee.qr_generated_at ? (
            <div className="mt-3"><QrImage token={employee.qr_token} size={240} label={employee.name} /></div>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">Your QR code has not been generated yet. Ask your company admin.</p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">
          No directory entry is linked to your account yet — ask your company admin to link it.
        </p>
      )}
    </div>
  );
}
