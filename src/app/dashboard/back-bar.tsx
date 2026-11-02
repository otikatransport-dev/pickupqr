"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { parentOf } from "@/lib/nav-parent";

/** The one Back control: same place (top-left under the header) on every dashboard page. */
export default function BackBar({ role }: { role: string | null }) {
  const parent = parentOf(usePathname(), role);
  if (!parent) return null;
  return (
    <nav aria-label="Back" className="mb-3">
      <Link href={parent.href} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand hover:bg-black/5">
        <span aria-hidden>←</span> Back to {parent.label}
      </Link>
    </nav>
  );
}
