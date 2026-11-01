import QRCode from "qrcode";

/** What is stored inside an employee's QR code. The prefix lets the scanner ignore any foreign QR code. */
export const QR_PREFIX = "pickupqr:";
export const qrPayload = (token: string) => QR_PREFIX + token;

/** Reads a scanned QR text back into the employee token, or null if it is not one of ours. */
export function tokenFromScan(text: string): string | null {
  const m = text.trim().match(/^pickupqr:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m ? m[1].toLowerCase() : null;
}

export function qrDataUrl(token: string, width = 360): Promise<string> {
  return QRCode.toDataURL(qrPayload(token), { width, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}
