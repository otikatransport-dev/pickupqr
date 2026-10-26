import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Not authorized</h1>
      <p className="text-sm text-neutral-500">Your account doesn&apos;t have access to that page.</p>
      <Link href="/dashboard" className="btn-primary">
        Go to my dashboard
      </Link>
    </main>
  );
}
