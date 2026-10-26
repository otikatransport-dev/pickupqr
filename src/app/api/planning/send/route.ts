import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toWhatsAppNumber } from "@/lib/phone";
import {
  getWhatsAppConfig,
  sendTemplateMessage,
  uploadMedia,
  WhatsAppError,
} from "@/lib/whatsapp";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // WhatsApp's limit for images
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, error: string, detail?: string) {
  return NextResponse.json({ ok: false, error, detail }, { status });
}

/** "2026-10-27" -> "Tuesday, October 27" in the template's language. */
function dateLabel(planDate: string, lang: string) {
  const d = new Date(`${planDate}T12:00:00`);
  try {
    return d.toLocaleDateString(lang.replace("_", "-"), { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return planDate;
  }
}

/**
 * POST /api/planning/send  { planningId: uuid, resend?: boolean }
 *
 * Sends one saved planning image to its driver over WhatsApp.
 * Runs as the signed-in admin, so Row Level Security decides which plannings they can touch.
 */
export async function POST(request: Request) {
  let input: { planningId?: unknown; resend?: unknown };
  try {
    input = await request.json();
  } catch {
    return fail(400, "bad_request", "Body must be JSON");
  }
  const planningId = typeof input.planningId === "string" ? input.planningId : "";
  const resend = input.resend === true;
  if (!UUID.test(planningId)) return fail(400, "bad_request", "planningId must be a UUID");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in");

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "super_admin" && me?.role !== "company_admin") return fail(403, "forbidden");

  // RLS: a company admin can only load plannings of their own company's drivers.
  const { data: planning } = await supabase.from("plannings").select("*").eq("id", planningId).maybeSingle();
  if (!planning) return fail(404, "planning_not_found");

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, profile_id, phone, whatsapp_opt_in")
    .eq("id", planning.driver_id)
    .single();
  if (!driver) return fail(404, "driver_not_found");
  const { data: driverProfile } = await supabase.from("profiles").select("full_name").eq("id", driver.profile_id).single();

  const cfg = getWhatsAppConfig();
  if (!cfg) return fail(503, "whatsapp_not_configured", "Set the WHATSAPP_* environment variables on the server.");

  if (!driver.whatsapp_opt_in) {
    return fail(409, "driver_not_opted_in", "This driver has not agreed to receive WhatsApp messages.");
  }
  const to = toWhatsAppNumber(driver.phone);
  if (!to) return fail(422, "driver_phone_invalid", "The driver's phone number is missing or not valid.");

  // Take the "send lock": only one request may move this planning into 'queued'.
  let lock = supabase
    .from("plannings")
    .update({ whatsapp_status: "queued", whatsapp_error: null })
    .eq("id", planning.id);
  if (!resend) lock = lock.or("whatsapp_status.is.null,whatsapp_status.eq.failed");
  const { data: locked } = await lock.select("id");
  if (!locked || locked.length === 0) {
    return fail(409, "already_sent", "Already sent. Use resend to send it again.");
  }

  const recordFailure = async (message: string) => {
    await supabase
      .from("plannings")
      .update({ whatsapp_status: "failed", whatsapp_error: message.slice(0, 400) })
      .eq("id", planning.id);
  };

  try {
    const { data: file, error: dlError } = await supabase.storage.from("plannings").download(planning.image_path);
    if (dlError || !file) throw new Error("Could not read the planning image from storage.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Image is larger than WhatsApp's 5 MB limit.");

    const mediaId = await uploadMedia(cfg, file, "planning.jpg");
    const messageId = await sendTemplateMessage(cfg, {
      to,
      mediaId,
      bodyParams: [driverProfile?.full_name || "driver", dateLabel(planning.plan_date, cfg.templateLang)],
    });

    await supabase
      .from("plannings")
      .update({
        whatsapp_status: "sent",
        whatsapp_message_id: messageId,
        whatsapp_sent_at: new Date().toISOString(),
        whatsapp_error: null,
      })
      .eq("id", planning.id);

    return NextResponse.json({ ok: true, status: "sent", messageId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await recordFailure(message);
    if (e instanceof WhatsAppError) return fail(502, "whatsapp_rejected", message);
    return fail(500, "send_failed", message);
  }
}
