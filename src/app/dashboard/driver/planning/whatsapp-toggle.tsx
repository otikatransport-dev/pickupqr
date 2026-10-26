"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Lets the driver agree (or stop agreeing) to receive their planning on WhatsApp. */
export default function WhatsAppToggle({ initial, phone }: { initial: boolean; phone: string | null }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(next: boolean) {
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("set_my_whatsapp_opt_in", { opt_in: next });
    setBusy(false);
    if (error) {
      setError("Couldn't save that. Try again.");
      return;
    }
    setOn(next);
    router.refresh();
  }

  return (
    <div className="card p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={(e) => change(e.target.checked)}
          className="mt-1 size-5"
        />
        <span className="text-sm">
          <span className="font-medium">Send my planning to my WhatsApp</span>
          <span className="mt-0.5 block text-neutral-500">
            {phone ? `We'll message ${phone}. ` : "Ask your admin to add your phone number. "}
            You can turn this off at any time.
          </span>
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
