import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Admin Centre",
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-5">
      {backHref && (
        <Link href={backHref} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
          <span aria-hidden>←</span> {backLabel}
        </Link>
      )}
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
    </div>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "error" | "info"; children: ReactNode }) {
  const cls =
    kind === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : kind === "error"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-900";
  return <p role={kind === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm ${cls}`}>{children}</p>;
}

export function Label({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}

export function Dot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
      style={{ background: color ?? "#cbd5e1" }}
    />
  );
}
