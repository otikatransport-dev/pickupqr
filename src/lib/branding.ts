/** App-wide branding (name, colours, logo), editable in the Admin Centre. */

export interface Branding {
  appName: string;
  brandColor: string;
  accentColor: string;
  logoUrl: string | null;
}

export const DEFAULT_BRANDING: Branding = {
  appName: "Otika Transport",
  brandColor: "#12284c",
  accentColor: "#f2a31b",
  logoUrl: null,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: string | null | undefined): v is string => !!v && HEX.test(v);

/** Black or white, whichever is readable on top of the given background colour. */
export function readableTextOn(hex: string): "#ffffff" | "#101828" {
  if (!HEX.test(hex)) return "#ffffff";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? "#101828" : "#ffffff";
}

/**
 * Reads the single branding row. Uses a plain REST call (anon key, no cookies) so it works for
 * signed-out visitors on the login page. Never throws: if the database is unreachable or the
 * migration has not been run yet, the default Otika look is used.
 */
export async function getBranding(): Promise<Branding> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return DEFAULT_BRANDING;
  try {
    const res = await fetch(
      `${url}/rest/v1/app_settings?id=eq.1&select=app_name,brand_color,accent_color,logo_url`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) return DEFAULT_BRANDING;
    const rows = (await res.json()) as Array<{
      app_name: string; brand_color: string; accent_color: string; logo_url: string | null;
    }>;
    const row = rows[0];
    if (!row) return DEFAULT_BRANDING;
    return {
      appName: row.app_name || DEFAULT_BRANDING.appName,
      brandColor: isHexColor(row.brand_color) ? row.brand_color : DEFAULT_BRANDING.brandColor,
      accentColor: isHexColor(row.accent_color) ? row.accent_color : DEFAULT_BRANDING.accentColor,
      logoUrl: row.logo_url || null,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

/** CSS that makes the whole app use the chosen colours (the app reads --brand-base / --accent). */
export function brandCss(b: Branding): string {
  return `:root{--brand-base:${b.brandColor};--accent:${b.accentColor};--on-brand:${readableTextOn(b.brandColor)};--on-accent:${readableTextOn(b.accentColor)};}`;
}
