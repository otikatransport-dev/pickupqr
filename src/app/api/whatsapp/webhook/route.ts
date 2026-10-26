import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { shouldAdvance, verifySignature, type WaStatus } from "@/lib/whatsapp";

export const runtime = "nodejs";

/**
 * WhatsApp webhook.
 *
 *  GET  – one-time handshake when you save the callback URL in the Meta dashboard.
 *  POST – delivery receipts (sent / delivered / read / failed) for the messages we sent.
 *
 * Every POST is checked against Meta's X-Hub-Signature-256 header (HMAC of the raw body
 * with your App Secret), so nobody else can forge delivery statuses.
 */

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const given = searchParams.get("hub.verify_token") ?? "";
  const challenge = searchParams.get("hub.challenge") ?? "";

  if (verifyToken && searchParams.get("hub.mode") === "subscribe" && safeEqual(given, verifyToken)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

interface StatusEvent {
  id?: string;
  status?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}
interface WebhookBody {
  entry?: { changes?: { value?: { statuses?: StatusEvent[] } }[] }[];
}

const KNOWN: WaStatus[] = ["sent", "delivered", "read", "failed"];

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return new Response("WHATSAPP_APP_SECRET is not set", { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const events: StatusEvent[] = (body.entry ?? []).flatMap((e) =>
    (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []),
  );
  if (events.length === 0) return NextResponse.json({ ok: true }); // e.g. incoming chat messages: nothing to do

  try {
    const admin = createAdminClient();
    for (const ev of events) {
      const status = ev.status as WaStatus;
      if (!ev.id || !KNOWN.includes(status)) continue;

      const { data: row } = await admin
        .from("plannings")
        .select("id, whatsapp_status")
        .eq("whatsapp_message_id", ev.id)
        .maybeSingle();
      if (!row || !shouldAdvance(row.whatsapp_status, status)) continue;

      const err = ev.errors?.[0];
      await admin
        .from("plannings")
        .update({
          whatsapp_status: status,
          whatsapp_error:
            status === "failed"
              ? `(${err?.code ?? "?"}) ${err?.error_data?.details || err?.message || err?.title || "Delivery failed"}`.slice(0, 400)
              : null,
        })
        .eq("id", row.id);
    }
  } catch (e) {
    console.error("whatsapp webhook failed", e);
    return new Response("Server error", { status: 500 }); // non-200 makes Meta retry later
  }
  return NextResponse.json({ ok: true });
}
