import "server-only";

import sharp from "sharp";

/**
 * The exact product on a design: the owner's own product photo, cut out of its
 * background, is placed in the design's hero spot. The image model designs the
 * scene around it (the canvas below), then the real pixels are pasted back on
 * top, so the product, its label and colours are exactly the photo.
 *
 * Cut-outs work for photos on a plain background (white or one colour, like a
 * studio or catalogue shot) and for PNGs that are already transparent.
 */

export type Format = "post" | "story";

/**
 * Where the product goes (fractions of the picture): text above it (headline,
 * subline), the button and contact line below. Stories keep the top 14% and
 * bottom 20% free for the app's own buttons.
 */
const ZONE: Record<Format, { top: number; bottom: number; maxWidth: number }> = {
  post: { top: 0.3, bottom: 0.78, maxWidth: 0.62 },
  story: { top: 0.36, bottom: 0.74, maxWidth: 0.66 },
};

export const zoneText = (format: Format) => {
  const z = ZONE[format];
  return { top: Math.round(z.top * 100), bottom: Math.round(z.bottom * 100), width: Math.round(z.maxWidth * 100) };
};

/** The product's rectangle on a picture of w × h (bottom-aligned in the zone, centred). */
export function placement(cutW: number, cutH: number, w: number, h: number, format: Format) {
  const z = ZONE[format];
  const zoneH = (z.bottom - z.top) * h;
  const scale = Math.min((z.maxWidth * w) / cutW, zoneH / cutH);
  const width = Math.max(1, Math.round(cutW * scale));
  const height = Math.max(1, Math.round(cutH * scale));
  return { left: Math.round((w - width) / 2), top: Math.round(z.top * h + zoneH - height), width, height };
}

const TOLERANCE = 42; // RGB distance that still counts as background
const MAX_SIDE = 1600;

/**
 * The product without its background (PNG, trimmed), or null when the photo's
 * background isn't plain enough to cut out reliably.
 */
export async function makeCutout(photo: Buffer): Promise<Buffer | null> {
  const { data, info } = await sharp(photo)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);

  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);

  const alpha = new Uint8ClampedArray(n);
  const transparentBorder = border.filter((i) => px[i * 4 + 3]! < 20).length / border.length;
  let flood = false;
  let dist: (i: number) => number = () => 0;

  if (transparentBorder > 0.5) {
    // Already a cut-out (transparent PNG).
    for (let i = 0; i < n; i++) alpha[i] = px[i * 4 + 3]!;
  } else {
    // The background colour: the median of the border; it must be (nearly) one colour.
    const median = [0, 1, 2].map((c) => {
      const v = border.map((i) => px[i * 4 + c]!).sort((a, b) => a - b);
      return v[v.length >> 1]!;
    }) as [number, number, number];
    dist = (i: number) => Math.hypot(px[i * 4]! - median[0], px[i * 4 + 1]! - median[1], px[i * 4 + 2]! - median[2]);
    if (border.filter((i) => dist(i) <= 40).length / border.length < 0.85) return null;

    // Flood the background in from the edges; what it can't reach is the product.
    flood = true;
    const bg = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    for (const i of border) {
      if (!bg[i] && dist(i) <= TOLERANCE) {
        bg[i] = 1;
        queue[tail++] = i;
      }
    }
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < n && !bg[j] && dist(j) <= TOLERANCE) {
          bg[j] = 1;
          queue[tail++] = j;
        }
      }
    }
    for (let i = 0; i < n; i++) alpha[i] = bg[i] ? 0 : 255;
  }

  // Drop specks: keep parts at least 1% the size of the biggest one.
  const label = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (alpha[s]! < 128 || label[s] !== -1) continue;
    const id = sizes.length;
    let top = 0;
    let size = 0;
    stack[top++] = s;
    label[s] = id;
    while (top) {
      const i = stack[--top]!;
      size++;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < n && alpha[j]! >= 128 && label[j] === -1) {
          label[j] = id;
          stack[top++] = j;
        }
      }
    }
    sizes.push(size);
  }
  if (!sizes.length) return null;
  const keep = Math.max(64, Math.max(...sizes) * 0.01);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (alpha[i]! >= 128 && sizes[label[i]!]! < keep) alpha[i] = 0;
    if (alpha[i]! > 0) {
      const x = i % w;
      const y = (i - x) / w;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  // Nothing found, or "everything is the product": not a usable cut-out.
  if (count < n * 0.02 || count > n * 0.97) return null;

  // Soft edges where the product meets the removed background.
  if (flood) {
    const soft = new Uint8ClampedArray(alpha);
    for (let i = 0; i < n; i++) {
      if (alpha[i] !== 255) continue;
      const x = i % w;
      const edge = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w].some((j) => j >= 0 && j < n && alpha[j] === 0);
      if (edge) soft[i] = Math.round(255 * Math.min(1, 0.4 + (dist(i) - TOLERANCE) / (2.5 * TOLERANCE)));
    }
    alpha.set(soft);
  }

  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = px[i * 4]!;
    out[i * 4 + 1] = px[i * 4 + 1]!;
    out[i * 4 + 2] = px[i * 4 + 2]!;
    out[i * 4 + 3] = alpha[i]!;
  }
  const pad = 4;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  return sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width: Math.min(w, maxX + pad + 1) - left, height: Math.min(h, maxY + pad + 1) - top })
    .png()
    .toBuffer();
}

async function placed(cutout: Buffer, w: number, h: number, format: Format) {
  const meta = await sharp(cutout).metadata();
  const p = placement(meta.width!, meta.height!, w, h, format);
  const input = await sharp(cutout).resize(p.width, p.height, { fit: "fill" }).png().toBuffer();
  return { input, left: p.left, top: p.top };
}

/**
 * The canvas for the image model: transparent, with the product in its spot.
 * It is also the mask (transparent = design here, the product = keep).
 */
export async function productCanvas(cutout: Buffer, w: number, h: number, format: Format) {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([await placed(cutout, w, h, format)])
    .png()
    .toBuffer();
}

/** The finished design with the real product pixels pasted back in their spot (JPEG). */
export async function pasteProduct(design: Buffer, cutout: Buffer, format: Format) {
  const meta = await sharp(design).metadata();
  return sharp(design)
    .composite([await placed(cutout, meta.width!, meta.height!, format)])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
