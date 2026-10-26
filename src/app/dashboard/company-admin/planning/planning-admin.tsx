"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { WhatsAppStatus } from "@/lib/database.types";
import { cropColumnToJpeg, readColumnHeader, readScreenshot } from "@/lib/planning/browser";
import { formatPlanDate, isISODate } from "@/lib/planning/dates";
import { matchDriver } from "@/lib/planning/match";
import { formatForDisplay, toWhatsAppNumber } from "@/lib/phone";

export interface DriverRow {
  id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  optIn: boolean;
}

export interface PlanningRow {
  id: string;
  driverId: string;
  planDate: string;
  shiftLabel: string | null;
  createdAt: string;
  viewedAt: string | null;
  waStatus: WhatsAppStatus | null;
  waError: string | null;
  url: string | null;
}

interface Props {
  drivers: DriverRow[];
  plannings: PlanningRow[];
  defaultDate: string;
  whatsappReady: boolean;
  userId: string;
}

interface Card {
  key: string;
  blob: Blob;
  previewUrl: string;
  sig: string;
  clase: string;
  driverId: string;
  hint: string;
  state: "idle" | "busy" | "done" | "error";
  message: string;
}

const SEND_ERRORS: Record<string, string> = {
  driver_not_opted_in: "This driver hasn't agreed to WhatsApp messages yet. Tick “WhatsApp OK” for them in the list below.",
  driver_phone_invalid: "This driver's phone number is missing or not valid.",
  whatsapp_not_configured: "WhatsApp isn't set up on the server yet.",
  already_sent: "Already sent over WhatsApp.",
  forbidden: "You don't have permission to send plannings.",
  not_signed_in: "Your session has expired. Sign in again.",
};

async function sendOnWhatsApp(planningId: string, resend: boolean): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/planning/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planningId, resend }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; detail?: string } | null;
    if (res.ok && body?.ok) return { ok: true, message: "Sent on WhatsApp." };
    const known = body?.error ? SEND_ERRORS[body.error] : undefined;
    return { ok: false, message: known ?? `WhatsApp: ${body?.detail || body?.error || `error ${res.status}`}` };
  } catch {
    return { ok: false, message: "Could not reach the server. Check your connection." };
  }
}

function statusBadge(p: PlanningRow | undefined): { label: string; tone: string } {
  if (!p) return { label: "Not sent", tone: "bg-neutral-100 text-neutral-600" };
  switch (p.waStatus) {
    case null:
      return { label: "In app only", tone: "bg-sky-100 text-sky-800" };
    case "queued":
      return { label: "Sending…", tone: "bg-amber-100 text-amber-800" };
    case "sent":
      return { label: "Sent on WhatsApp", tone: "bg-emerald-100 text-emerald-800" };
    case "delivered":
      return { label: "Delivered", tone: "bg-emerald-100 text-emerald-800" };
    case "read":
      return { label: "Read on WhatsApp", tone: "bg-emerald-200 text-emerald-900" };
    case "failed":
      return { label: "WhatsApp failed", tone: "bg-red-100 text-red-800" };
  }
}

export default function PlanningAdmin({ drivers, plannings, defaultDate, whatsappReady, userId }: Props) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [planDate, setPlanDate] = useState(defaultDate);
  const [notice, setNotice] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [note, setNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<Record<string, { text: string; ok: boolean }>>({});

  const fileInput = useRef<HTMLInputElement>(null);
  const sigs = useRef(new Set<string>());
  const urls = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());

  // free the preview images when leaving the page
  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const patchCard = useCallback((key: string, patch: Partial<Card>) => {
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }, []);

  // ---- screenshot in -> one card per driver column ------------------------------------
  const processFile = useCallback(
    async (file: Blob) => {
      try {
        const shot = await readScreenshot(file);
        if (shot.columns.length === 0) {
          setNote("Rejected: no columns found. Use a screenshot where the cell lines of the sheet are visible.");
          return;
        }
        let empty = 0;
        let repeated = 0;
        const added: { key: string; col: (typeof shot.columns)[number] }[] = [];
        for (const col of shot.columns) {
          if (col.empty) {
            empty++;
            continue;
          }
          if (sigs.current.has(col.sig)) {
            repeated++;
            continue;
          }
          sigs.current.add(col.sig);
          const blob = await cropColumnToJpeg(shot.canvas, col);
          const previewUrl = URL.createObjectURL(blob);
          urls.current.add(previewUrl);
          const key = crypto.randomUUID();
          added.push({ key, col });
          setCards((cs) => [
            ...cs,
            { key, blob, previewUrl, sig: col.sig, clase: "", driverId: "", hint: "Reading name and phone…", state: "idle", message: "" },
          ]);
        }
        const parts = [`${added.length} column${added.length === 1 ? "" : "s"} added`];
        if (empty) parts.push(`${empty} without work skipped`);
        if (repeated) parts.push(`${repeated} already loaded`);
        setNote(added.length ? parts.join(" · ") : `Nothing added: ${parts.slice(1).join(" · ") || "no usable columns"}.`);

        // read the header of each new column; fill in the driver only if it matches exactly one
        for (const { key, col } of added) {
          const guess = await readColumnHeader(shot.canvas, col);
          const driverId = guess ? matchDriver(guess.name, guess.phone, drivers.map((d) => ({ id: d.id, name: d.name, phone: d.phone }))) : null;
          setCards((cs) =>
            cs.map((c) =>
              c.key !== key
                ? c
                : {
                    ...c,
                    clase: c.clase || guess?.clase || "",
                    driverId: c.driverId || driverId || "",
                    hint: driverId ? "Driver matched — check it is right" : guess?.name ? `Read “${guess.name}” — choose the driver` : "Choose the driver",
                  },
            ),
          );
        }
      } catch {
        setNote("Couldn't read that image.");
      }
    },
    [drivers],
  );

  const addFiles = useCallback(
    (list: Iterable<File> | null | undefined) => {
      for (const f of Array.from(list ?? [])) {
        if (!f.type.startsWith("image/")) continue;
        queue.current = queue.current.then(() => processFile(f));
      }
    },
    [processFile],
  );

  // Ctrl+V anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((i) => i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const removeCard = (key: string) => {
    setCards((cs) => {
      const c = cs.find((x) => x.key === key);
      if (c) {
        URL.revokeObjectURL(c.previewUrl);
        urls.current.delete(c.previewUrl);
        sigs.current.delete(c.sig);
      }
      return cs.filter((x) => x.key !== key);
    });
  };

  const clearAll = () => {
    if (cards.length && !window.confirm("Remove all loaded columns?")) return;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
    sigs.current.clear();
    setCards([]);
    setNote("");
  };

  // ---- publish a card: upload image -> save row -> (optionally) send on WhatsApp ---------
  const publish = async (card: Card, viaWhatsApp: boolean) => {
    if (!card.driverId) return patchCard(card.key, { state: "error", message: "Choose a driver first." });
    if (!isISODate(planDate)) return patchCard(card.key, { state: "error", message: "Pick the planning date first." });

    patchCard(card.key, { state: "busy", message: "Saving…" });
    const path = `${card.driverId}/${planDate}/${crypto.randomUUID()}.jpg`;

    const up = await supabase.storage.from("plannings").upload(path, card.blob, { contentType: "image/jpeg" });
    if (up.error) return patchCard(card.key, { state: "error", message: `Upload failed: ${up.error.message}` });

    const ins = await supabase
      .from("plannings")
      .insert({
        driver_id: card.driverId,
        plan_date: planDate,
        image_path: path,
        shift_label: card.clase.trim() || null,
        notice: notice.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) {
      await supabase.storage.from("plannings").remove([path]); // don't leave an orphaned file
      return patchCard(card.key, { state: "error", message: `Couldn't save: ${ins.error?.message ?? "unknown error"}` });
    }

    if (!viaWhatsApp) {
      patchCard(card.key, { state: "done", message: "Saved — the driver can see it in the app." });
    } else {
      patchCard(card.key, { state: "busy", message: "Sending on WhatsApp…" });
      const r = await sendOnWhatsApp(ins.data.id, false);
      patchCard(card.key, {
        state: r.ok ? "done" : "error",
        message: r.ok ? "Saved and sent on WhatsApp." : `Saved in the app, but not sent. ${r.message}`,
      });
    }
    router.refresh();
  };

  // ---- per-driver list --------------------------------------------------------------------
  const latestFor = (driverId: string) =>
    plannings
      .filter((p) => p.driverId === driverId && p.planDate === planDate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const setOptIn = async (d: DriverRow, value: boolean) => {
    setBusyRow(d.id);
    const { error } = await supabase
      .from("drivers")
      .update({ whatsapp_opt_in: value, whatsapp_opt_in_at: value ? new Date().toISOString() : null })
      .eq("id", d.id);
    setBusyRow(null);
    if (error) setRowMessage((m) => ({ ...m, [d.id]: { text: `Couldn't update: ${error.message}`, ok: false } }));
    else router.refresh();
  };

  const resendRow = async (d: DriverRow, p: PlanningRow) => {
    const already = p.waStatus === "sent" || p.waStatus === "delivered" || p.waStatus === "read";
    if (already && !window.confirm(`Send ${d.name}'s planning on WhatsApp again?`)) return;
    setBusyRow(d.id);
    setRowMessage((m) => ({ ...m, [d.id]: { text: "Sending…", ok: true } }));
    const r = await sendOnWhatsApp(p.id, already || p.waStatus === "queued");
    setBusyRow(null);
    setRowMessage((m) => ({ ...m, [d.id]: { text: r.message, ok: r.ok } }));
    router.refresh();
  };

  const planned = drivers.filter((d) => latestFor(d.id)).length;
  const inputCls = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Planning</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste a screenshot of the shift sheet. Each driver&apos;s column is cut out, matched to the driver, and sent to them.
        </p>
      </div>

      {!whatsappReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          WhatsApp isn&apos;t connected yet. You can still publish plannings in the app; the WhatsApp buttons work once the{" "}
          <code>WHATSAPP_*</code> settings are added (see <code>docs/whatsapp-planning-setup.md</code>).
        </p>
      )}

      {/* date + note + drop zone */}
      <section className="flex flex-col gap-3 card p-4">
        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
          <label className="text-xs font-medium text-neutral-600">
            Planning date
            <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="text-xs font-medium text-neutral-600">
            Note for drivers (shown in the app, optional)
            <input value={notice} onChange={(e) => setNotice(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInput.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(Array.from(e.dataTransfer.files));
          }}
          className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-sm ${dragOver ? "border-sky-500 text-sky-700" : "border-neutral-300 text-neutral-600"}`}
        >
          <strong className="text-neutral-900">Paste a screenshot (Ctrl+V)</strong>, drop it here, or tap to choose one. You can add
          several; each is added to the previous ones.
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-neutral-500" aria-live="polite">
          <span>{note}</span>
          {cards.length > 0 && (
            <button onClick={clearAll} className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-700">
              Clear all
            </button>
          )}
        </div>
      </section>

      {/* one card per detected column */}
      {cards.length > 0 && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const d = drivers.find((x) => x.id === c.driverId);
            const waBlock = !whatsappReady
              ? "WhatsApp isn't set up yet"
              : !d
                ? "Choose a driver first"
                : !d.optIn
                  ? "Driver hasn't agreed to WhatsApp"
                  : !toWhatsAppNumber(d.phone)
                    ? "Driver has no valid phone number"
                    : "";
            const busy = c.state === "busy";
            return (
              <article key={c.key} className="flex flex-col gap-3 card p-3">
                <div className="h-64 overflow-auto rounded-md border border-neutral-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.previewUrl} alt="Planning column" className="w-full" />
                </div>
                <select
                  value={c.driverId}
                  onChange={(e) => patchCard(c.key, { driverId: e.target.value, state: "idle", message: "" })}
                  className={inputCls}
                  aria-label="Driver"
                  disabled={busy || c.state === "done"}
                >
                  <option value="">Choose driver…</option>
                  {drivers.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <input
                  value={c.clase}
                  onChange={(e) => patchCard(c.key, { clase: e.target.value })}
                  placeholder="Class / shift label (optional)"
                  aria-label="Class or shift label"
                  className={inputCls}
                  disabled={busy || c.state === "done"}
                />
                <p className="min-h-4 text-xs text-neutral-500">{c.hint}</p>

                {c.state === "done" ? (
                  <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{c.message}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => publish(c, false)}
                      disabled={busy || !c.driverId}
                      className="min-h-11 rounded-lg bg-brand px-3 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Publish in app
                    </button>
                    <button
                      onClick={() => publish(c, true)}
                      disabled={busy || !!waBlock}
                      title={waBlock}
                      className="min-h-11 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Publish + send on WhatsApp
                    </button>
                    {waBlock && c.driverId && <p className="text-xs text-neutral-500">{waBlock}.</p>}
                    {c.message && (
                      <p className={`text-xs ${c.state === "error" ? "text-red-700" : "text-neutral-600"}`} aria-live="polite">
                        {c.message}
                      </p>
                    )}
                  </div>
                )}
                <button onClick={() => removeCard(c.key)} disabled={busy} className="self-start text-xs text-neutral-500 underline">
                  Remove
                </button>
              </article>
            );
          })}
        </section>
      )}

      {/* who has what, for the chosen date */}
      <section className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <h2 className="font-semibold">Drivers — {isISODate(planDate) ? formatPlanDate(planDate) : "pick a date"}</h2>
          <p className="text-sm text-neutral-500">
            {planned} of {drivers.length} have a planning
          </p>
        </div>
        {drivers.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">No drivers yet. Add driver rows first (see the README, section 6).</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {drivers.map((d) => {
              const p = latestFor(d.id);
              const badge = statusBadge(p);
              const canWa = whatsappReady && !!p && d.optIn && !!toWhatsAppNumber(d.phone);
              const alreadySent = p?.waStatus === "sent" || p?.waStatus === "delivered" || p?.waStatus === "read";
              return (
                <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {d.vehicle ? `${d.vehicle} · ` : ""}
                      {d.phone ? formatForDisplay(d.phone) : "no phone"}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      checked={d.optIn}
                      disabled={busyRow === d.id}
                      onChange={(e) => setOptIn(d, e.target.checked)}
                    />
                    WhatsApp OK
                  </label>
                  <div className="flex flex-wrap items-center gap-2 sm:w-72">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.tone}`}>{badge.label}</span>
                    {p?.viewedAt && (
                      <span className="text-xs text-neutral-500">
                        Seen{" "}
                        <time dateTime={p.viewedAt} suppressHydrationWarning>
                          {new Date(p.viewedAt).toLocaleString("en-CA", { dateStyle: "short", timeStyle: "short" })}
                        </time>
                      </span>
                    )}
                    {p?.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                        View
                      </a>
                    )}
                  </div>
                  {p && (
                    <button
                      onClick={() => resendRow(d, p)}
                      disabled={!canWa || busyRow === d.id}
                      title={canWa ? "" : "Needs WhatsApp set up, the driver's consent and a valid phone number"}
                      className="min-h-10 rounded-lg border border-neutral-300 px-3 text-sm disabled:opacity-40"
                    >
                      {alreadySent ? "Resend on WhatsApp" : "Send on WhatsApp"}
                    </button>
                  )}
                  {(rowMessage[d.id] || (p?.waStatus === "failed" && p.waError)) && (
                    <p
                      className={`text-xs sm:basis-full ${rowMessage[d.id]?.ok ? "text-neutral-600" : "text-red-700"}`}
                      aria-live="polite"
                    >
                      {rowMessage[d.id]?.text ?? p?.waError}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
