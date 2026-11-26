// The Retexia mark (packages/ui/src/brand/retexia-mark.svg) for the icon scripts: draws it centred
// in a square or a banner, in any colour, on any background.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export const sharp = createRequire(new URL("../../panels/package.json", import.meta.url))("sharp");
export const BLUE = "#005DE0";
const src = readFileSync(new URL("../../../packages/ui/src/brand/retexia-mark.svg", import.meta.url), "utf8");
const [vx, vy, vw, vh] = src.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const paths = [...src.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);

/** The mark as SVG <g>, fitted into a box (x, y, width, height), keeping its shape. */
export function markGroup({ x, y, w, h, color = BLUE }) {
  const s = Math.min(w / vw, h / vh);
  const tx = x + (w - vw * s) / 2 - vx * s;
  const ty = y + (h - vh * s) / 2 - vy * s;
  return `<g transform="translate(${tx} ${ty}) scale(${s})" fill="${color}">${paths.map((d) => `<path d="${d}"/>`).join("")}</g>`;
}

/** A square PNG: the mark at `size` × `scale` wide, on `bg` (null = transparent), optional rounded corners. */
export async function square(file, { size, scale, color = BLUE, bg = null, radius = 0 }) {
  const m = size * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : ""}${markGroup({ x: (size - m) / 2, y: (size - m) / 2, w: m, h: m, color })}</svg>`;
  let img = sharp(Buffer.from(svg)).png();
  if (bg && !radius) img = img.flatten({ background: bg });
  await img.toFile(file);
}
