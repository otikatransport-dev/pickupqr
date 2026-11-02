import Link from "next/link";
import SignOutButton from "../dashboard/sign-out-button";

export default async function UnauthorizedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const deactivated = reason === "deactivated";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">{deactivated ? "Account deactivated" : "Not authorized"}</h1>
      <p className="text-sm text-neutral-500">
        {deactivated ? "Your account has been deactivated. Contact your manager if you think this is a mistake." : "Your account doesn't have access to that page."}
      </p>
      {deactivated ? <SignOutButton /> : <Link href="/dashboard" className="btn-primary">Go to my dashboard</Link>}
    </main>
  );
}
