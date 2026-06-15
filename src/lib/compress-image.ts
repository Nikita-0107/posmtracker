/**
 * Compress an image file in the browser using a canvas.
 * Targets ~150KB webp (jpeg fallback) with a hard cap around 400KB.
 */
const MAX_EDGE = 1024;
const TARGET_BYTES = 150 * 1024;
const HARD_CAP_BYTES = 400 * 1024;

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;

  const loadViaEvents = () =>
    new Promise<void>((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve();
        return;
      }
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
    });

  try {
    await img.decode();
  } catch {
    // Mobile Safari can reject decode() even when the image is loadable.
    await loadViaEvents();
  }

  return img;
}

function drawScaled(img: HTMLImageElement): HTMLCanvasElement {
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, cw, ch);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file: File): Promise<File> {
  // Skip if already tiny
  if (file.size <= TARGET_BYTES && file.type.startsWith("image/")) {
    return file;
  }
  const url = URL.createObjectURL(file);
  let canvas: HTMLCanvasElement;
  try {
    const img = await loadImage(url);
    canvas = drawScaled(img);
  } finally {
    // Revoke only after drawImage has copied the pixels. Revoking immediately
    // after decode is unreliable on mobile browsers.
    URL.revokeObjectURL(url);
  }

  const qualities = [0.78, 0.65, 0.5];
  // Try webp first, then jpeg fallback
  for (const type of ["image/webp", "image/jpeg"]) {
    for (const q of qualities) {
      const blob = await canvasToBlob(canvas, type, q);
      if (!blob) continue;
      if (blob.size <= TARGET_BYTES || (q === qualities[qualities.length - 1] && blob.size <= HARD_CAP_BYTES)) {
        const ext = type === "image/webp" ? "webp" : "jpg";
        return new File([blob], `material.${ext}`, { type: blob.type || type });
      }
    }
  }
  // Last-resort: jpeg at lowest quality
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.4);
  if (!blob) throw new Error("Failed to encode image");
  return new File([blob], "material.jpg", { type: "image/jpeg" });
}
