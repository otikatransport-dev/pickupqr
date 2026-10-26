"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Tells the admin the driver has opened their planning (sets viewed_at once). Renders nothing. */
export default function MarkViewed({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    const supabase = createClient();
    for (const planning_id of key.split(",")) {
      void supabase.rpc("mark_planning_viewed", { planning_id });
    }
  }, [key]);
  return null;
}
