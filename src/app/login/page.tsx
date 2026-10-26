import { getBranding } from "@/lib/branding";
import LoginPanel from "./login-form";

export default async function LoginPage() {
  const branding = await getBranding();
  return <LoginPanel appName={branding.appName} logoUrl={branding.logoUrl} />;
}
