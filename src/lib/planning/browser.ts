"use client";

/**
 * Browser-only helpers for the planning uploader: decode a pasted screenshot, cut out one
 * JPG per driver column, and (optionally) read the name / phone from each column's header
 * with OCR. Ported from the original "Envío de Planning" page.
 */
import { detectColumns, type DetectedColumn } from "./detect";
import { parseHeaderText, type HeaderGuess } from "./parse-header";

export interface LoadedScreenshot {
  /** The full screenshot, kept so OCR can re-read the headers. */
  canvas: HTMLCanvasElement;
  columns: DetectedColumn[];
}

export async function readScreenshot(file: Blob): Promise<LoadedScreenshot> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, columns: detectColumns({ width: canvas.width, height: canvas.height, data }) };
}

/** Cuts one column out at 2x with a white margin, as a JPG (WhatsApp accepts up to 5 MB). */
export function cropColumnToJpeg(source: HTMLCanvasElement, c: DetectedColumn): Promise<Blob> {
  const scale = 2;
  const pad = 12;
  const w = c.x1 - c.x0;
  const h = c.y1 - c.y0;
  const out = document.createElement("canvas");
  out.width = w * scale + pad * 2;
  out.height = h * scale + pad * 2;
  const ctx = out.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas is not available in this browser"));
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, c.x0, c.y0, w, h, pad, pad, w * scale, h * scale);
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image"))), "image/jpeg", 0.92),
  );
}

// ---- OCR (Tesseract, loaded from a CDN only when first needed) -------------------------

interface TesseractWorker {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text?: string } }>;
}
interface TesseractGlobal {
  createWorker(lang: string): Promise<TesseractWorker>;
}

let workerPromise: Promise<TesseractWorker> | null = null;

function loadWorker(): Promise<TesseractWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = new Promise<TesseractWorker>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    script.onload = async () => {
      try {
        const T = (window as unknown as { Tesseract: TesseractGlobal }).Tesseract;
        resolve(await T.createWorker("eng"));
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error("Could not load the OCR library"));
    document.head.appendChild(script);
  });
  // allow a retry on the next upload if loading failed (offline, blocked, ...)
  workerPromise.catch(() => {
    workerPromise = null;
  });
  return workerPromise;
}

/** Reads the name / phone / class label from the top of one column. Never throws. */
export async function readColumnHeader(source: HTMLCanvasElement, c: DetectedColumn): Promise<HeaderGuess | null> {
  try {
    const worker = await loadWorker();
    const scale = 3;
    const w = c.x1 - c.x0;
    const h = Math.min(c.y1, Math.round(source.height * 0.2));
    const cv = document.createElement("canvas");
    cv.width = w * scale;
    cv.height = h * scale;
    cv.getContext("2d")?.drawImage(source, c.x0, 0, w, h, 0, 0, w * scale, h * scale);
    const { data } = await worker.recognize(cv);
    return parseHeaderText(data.text || "");
  } catch {
    return null;
  }
}
