"use client";

import { qrDataUrl } from "@/lib/qr";
import QrImage from "@/components/qr-image";

export interface QrPerson { id: string; name: string; company: string; token: string }

/** Shows one or many QR cards, with Download (one) and Print (all). */
export default function QrCardsModal({ people, onClose }: { people: QrPerson[]; onClose: () => void }) {
  async function download(p: QrPerson) {
    const url = await qrDataUrl(p.token, 800);
    const a = document.createElement("a");
    a.href = url; a.download = "qr-" + p.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() + ".png"; a.click();
  }
  const one = people.length === 1;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card my-6 w-full max-w-3xl p-5">
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <h3 className="text-lg font-semibold">{one ? "QR code" : `${people.length} QR codes`}</h3>
          <div className="flex gap-2">
            {one && <button className="btn-secondary" onClick={() => download(people[0])}>⬇ Download PNG</button>}
            <button className="btn-primary" onClick={() => window.print()}>🖨 Print</button>
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="qr-print grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {people.map((p) => (
            <div key={p.id} className="qr-card flex flex-col items-center gap-2 rounded-xl border border-neutral-300 p-3 text-center">
              <QrImage token={p.token} size={one ? 240 : 160} label={p.name} />
              <p className="text-sm font-semibold leading-tight">{p.name}</p>
              {p.company && <p className="text-xs text-neutral-500">{p.company}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
