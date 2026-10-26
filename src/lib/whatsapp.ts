/**
 * WhatsApp Business Cloud API client (server-side only).
 *
 * Never import this from a client component: it reads the access token from the
 * environment. The browser only ever talks to /api/planning/send.
 *
 * Sending a planning = two calls:
 *   1. POST /{phone-number-id}/media     -> uploads the JPG, returns a media id
 *   2. POST /{phone-number-id}/messages  -> sends your approved template, with that
 *                                           image in the header and the driver's name /
 *                                           date in the body.
 * A template is required because the driver has not messaged you in the last 24 hours;
 * WhatsApp only allows free-form messages inside that window.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  templateLang: string;
  graphVersion: string;
  baseUrl: string;
}

/** Returns null when the required settings are missing (planning then stays in-app only). */
export function getWhatsAppConfig(env: Record<string, string | undefined> = process.env): WhatsAppConfig | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = env.WHATSAPP_TEMPLATE_NAME?.trim();
  if (!accessToken || !phoneNumberId || !templateName) return null;
  return {
    accessToken,
    phoneNumberId,
    templateName,
    templateLang: env.WHATSAPP_TEMPLATE_LANG?.trim() || "en",
    graphVersion: env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0",
    baseUrl: (env.WHATSAPP_GRAPH_BASE_URL?.trim() || "https://graph.facebook.com").replace(/\/+$/, ""),
  };
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly metaCode?: number,
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

/** Meta wraps failures as { error: { message, code, error_data: { details } } }. */
export function describeMetaError(status: number, body: unknown): WhatsAppError {
  const e = (body as { error?: { message?: string; code?: number; error_data?: { details?: string } } } | null)?.error;
  const detail = e?.error_data?.details || e?.message || `HTTP ${status}`;
  const msg = e?.code ? `(${e.code}) ${detail}` : detail;
  return new WhatsAppError(msg.slice(0, 400), status, e?.code);
}

/** Template parameters may not contain newlines, tabs or 4+ spaces in a row. */
export function sanitizeParam(s: string): string {
  const clean = s.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
  return (clean || "-").slice(0, 200);
}

export interface TemplatePayloadInput {
  to: string; // digits only, with country code
  templateName: string;
  lang: string;
  mediaId: string;
  bodyParams: string[];
}

export function buildTemplatePayload(i: TemplatePayloadInput) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: i.to,
    type: "template",
    template: {
      name: i.templateName,
      language: { code: i.lang },
      components: [
        { type: "header", parameters: [{ type: "image", image: { id: i.mediaId } }] },
        { type: "body", parameters: i.bodyParams.map((t) => ({ type: "text", text: sanitizeParam(t) })) },
      ],
    },
  };
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Step 1: upload the image to WhatsApp, get back a media id. */
export async function uploadMedia(cfg: WhatsAppConfig, image: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", image.type || "image/jpeg");
  form.append("file", image, filename);

  const res = await fetch(`${cfg.baseUrl}/${cfg.graphVersion}/${cfg.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await parseJson(res);
  const id = (body as { id?: string } | null)?.id;
  if (!res.ok || !id) throw describeMetaError(res.status, body);
  return id;
}

/** Step 2: send the template message. Returns WhatsApp's message id (wamid...). */
export async function sendTemplateMessage(cfg: WhatsAppConfig, input: Omit<TemplatePayloadInput, "templateName" | "lang">): Promise<string> {
  const payload = buildTemplatePayload({ ...input, templateName: cfg.templateName, lang: cfg.templateLang });
  const res = await fetch(`${cfg.baseUrl}/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await parseJson(res);
  const messageId = (body as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
  if (!res.ok || !messageId) throw describeMetaError(res.status, body);
  return messageId;
}

/**
 * Verifies Meta's X-Hub-Signature-256 header: "sha256=" + HMAC-SHA256(rawBody, appSecret).
 * Must be computed over the RAW request body, before any JSON parsing.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(header.slice("sha256=".length), "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type WaStatus = "queued" | "sent" | "delivered" | "read" | "failed";
const RANK: Record<WaStatus, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 99 };

/** Webhook events can arrive out of order; never move a message backwards. */
export function shouldAdvance(current: WaStatus | null, next: WaStatus): boolean {
  if (!current) return true;
  if (next === "failed") return current === "queued" || current === "sent";
  if (current === "failed") return false;
  return RANK[next] > RANK[current];
}
