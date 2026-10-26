/**
 * Column detection for a shift-sheet screenshot.
 *
 * Ported from the original "Envío de Planning" page, with one change: it works on a
 * plain pixel array (RGBA) instead of reading from a <canvas>, so it has no DOM
 * dependency and can be unit-tested in Node against a real screenshot.
 *
 * What it does: finds the vertical cell lines of the sheet, treats each gap between two
 * lines as one driver's column, trims the empty rows at the bottom, and flags columns
 * that only have the header and no work assigned.
 */

export interface PixelImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major (same layout as canvas ImageData.data). */
  data: Uint8ClampedArray | Uint8Array;
}

export interface DetectedColumn {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** True when the column has a header but no work assigned below it. */
  empty: boolean;
  /** Coarse fingerprint, used to skip the same column if it is pasted twice. */
  sig: string;
}

const SIG_W = 12;
const SIG_H = 40;

export function detectColumns(img: PixelImage): DetectedColumn[] {
  const { width: W, height: H, data: px } = img;
  const at = (x: number, y: number) => (y * W + x) * 4;

  // 1) x positions where a long vertical run of pixels changes colour = a cell line
  const cand: number[] = [];
  for (let x = 1; x < W; x++) {
    let tot = 0;
    let run = 0;
    for (let y = 0; y < H; y++) {
      const a = at(x, y);
      const b = at(x - 1, y);
      const edge =
        Math.abs(px[a] - px[b]) + Math.abs(px[a + 1] - px[b + 1]) + Math.abs(px[a + 2] - px[b + 2]) > 30;
      if (edge) run++;
      else {
        if (run >= 14) tot += run;
        run = 0;
      }
    }
    if (run >= 14) tot += run;
    if (tot > 0.3 * H) cand.push(x);
  }

  // 2) merge neighbouring candidate lines (a thick border is several pixels wide)
  const lines: [number, number][] = [];
  for (const x of cand) {
    const last = lines[lines.length - 1];
    if (last && x - last[1] <= 4) last[1] = x;
    else lines.push([x, x]);
  }

  // 3) every gap between two lines that is wide enough is a column
  const out: DetectedColumn[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const x0 = lines[i][0];
    const x1 = lines[i + 1][1] + 1;
    if (x1 - x0 >= 70) out.push({ x0, x1, y0: 0, y1: H, empty: false, sig: "" });
  }

  const isPaper = (r: number, g: number, b: number) => {
    const mn = Math.min(r, g, b);
    const mx = Math.max(r, g, b);
    return mn > 200 && mx - mn < 25; // near-white / very light grey
  };

  for (const c of out) {
    // trim blank rows at the bottom
    let last = 0;
    for (let y = H - 1; y >= 0 && !last; y--) {
      for (let x = c.x0 + 3; x < c.x1 - 3; x++) {
        const a = at(x, y);
        if (!isPaper(px[a], px[a + 1], px[a + 2])) {
          last = y;
          break;
        }
      }
    }
    c.y0 = 0;
    c.y1 = Math.min(H, (last || H) + 6);

    // the red band marks the end of the header; anything inked below it is real work
    const m = Math.round((c.x1 - c.x0) * 0.12);
    const xa = c.x0 + m;
    const xb = c.x1 - m;
    let hb = -1;
    for (let y = 0; y < H * 0.45; y++) {
      let red = 0;
      for (let x = xa; x < xb; x++) {
        const a = at(x, y);
        if (px[a] > 200 && px[a + 1] < 70 && px[a + 2] < 70) red++;
      }
      if (red > (xb - xa) * 0.5) hb = y;
    }
    if (hb < 0) hb = Math.round(H * 0.2);
    let ink = 0;
    for (let y = hb + 3; y < H - 4; y++) {
      for (let x = xa; x < xb; x++) {
        const a = at(x, y);
        if (!isPaper(px[a], px[a + 1], px[a + 2])) ink++;
      }
    }
    c.empty = ink < 150;

    c.sig = signature(img, c);
  }
  return out;
}

/**
 * 12x40 area-averaged thumbnail of the column, quantised to 3 bits per channel.
 * (The original used canvas drawImage scaling; area averaging is the same idea and
 * only needs to be self-consistent, since it is only compared against itself.)
 */
function signature(img: PixelImage, c: { x0: number; x1: number; y1: number }): string {
  const { width: W, data: px } = img;
  const w = c.x1 - c.x0;
  const h = c.y1;
  const parts: number[] = [];
  for (let cy = 0; cy < SIG_H; cy++) {
    const ya = Math.floor((cy * h) / SIG_H);
    const yb = Math.max(ya + 1, Math.floor(((cy + 1) * h) / SIG_H));
    for (let cx = 0; cx < SIG_W; cx++) {
      const xa = c.x0 + Math.floor((cx * w) / SIG_W);
      const xb = c.x0 + Math.max(Math.floor((cx * w) / SIG_W) + 1, Math.floor(((cx + 1) * w) / SIG_W));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          const a = (y * W + x) * 4;
          r += px[a];
          g += px[a + 1];
          b += px[a + 2];
          n++;
        }
      }
      parts.push(n ? (r / n) >> 5 : 0, n ? (g / n) >> 5 : 0, n ? (b / n) >> 5 : 0);
    }
  }
  return parts.join("");
}
