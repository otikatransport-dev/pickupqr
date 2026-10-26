/**
 * Phone helpers.
 *
 * WhatsApp wants the number as digits only, with country code and no "+" or spaces
 * (e.g. 15145551234). Drivers' numbers are stored however people typed them
 * ("(514) 625-3007", "438-466-1748"), so we normalise at send time.
 */

/** Default country code for numbers typed without one (Canada / US = 1). */
const DEFAULT_COUNTRY_CODE = "1";

/**
 * Returns the WhatsApp-ready number (digits with country code) or null if the
 * input can't be a valid number.
 *   "(514) 625-3007"   -> "15146253007"
 *   "+1 438 886 6689"  -> "14388866689"
 *   "514625"           -> null
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (trimmed.startsWith("+")) {
    // explicit international format: E.164 allows up to 15 digits
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  if (digits.length === 10) return DEFAULT_COUNTRY_CODE + digits; // local number, no country code
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** "15146253007" -> "+1 514 625 3007" (display only). */
export function formatForDisplay(raw: string | null | undefined): string {
  const n = toWhatsAppNumber(raw);
  if (!n) return raw?.trim() || "";
  if (n.length === 11 && n.startsWith("1")) return `+1 ${n.slice(1, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  return `+${n}`;
}
