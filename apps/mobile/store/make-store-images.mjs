// Google Play store images from the Retexia mark: 512×512 icon and 1024×500 feature graphic.
//   node apps/mobile/store/make-store-images.mjs
import { BLUE, markGroup, sharp, square } from "../scripts/brand.mjs";

const out = (f) => new URL(f, import.meta.url).pathname;
await square(out("play-icon-512.png"), { size: 512, scale: 0.6, bg: "#ffffff" });
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="${BLUE}"/>
  <circle cx="900" cy="80" r="260" fill="#ffffff" opacity="0.06"/>
  <rect x="96" y="120" width="150" height="150" rx="34" fill="#fff"/>
  ${markGroup({ x: 118, y: 142, w: 106, h: 106 })}
  <text x="96" y="360" font-family="Helvetica, Arial, sans-serif" font-size="68" font-weight="300" fill="#fff">Retexia</text>
  <text x="96" y="410" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#dbe7fb">Your Retexia tools, on your phone</text>
</svg>`;
await sharp(Buffer.from(feature)).png().toFile(out("play-feature-graphic-1024x500.png"));
console.log("written: apps/mobile/store/play-icon-512.png, play-feature-graphic-1024x500.png");
