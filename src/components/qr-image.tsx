"use client";

import { useEffect, useState } from "react";
import { qrDataUrl } from "@/lib/qr";

/** Draws the QR code for an employee token in the browser (nothing is stored or uploaded). */
export default function QrImage({ token, size = 220, label }: { token: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    qrDataUrl(token, size * 2).then((u) => live && setSrc(u)).catch(() => live && setSrc(null));
    return () => { live = false; };
  }, [token, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={`QR code for ${label}`} width={size} height={size} /> : <div style={{ width: size, height: size }} className="animate-pulse rounded bg-neutral-200" />;
}
