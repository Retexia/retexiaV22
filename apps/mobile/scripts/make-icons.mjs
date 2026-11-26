// The app's icons from the Retexia mark (packages/ui/src/brand/retexia-mark.svg):
//   node apps/mobile/scripts/make-icons.mjs
import { mkdirSync } from "node:fs";
import { BLUE, square } from "./brand.mjs";

const out = (f) => new URL(`../assets/${f}`, import.meta.url).pathname;
mkdirSync(new URL("../assets/", import.meta.url), { recursive: true });

await Promise.all([
  // Store / iOS icon: the blue mark on white, no transparency.
  square(out("icon.png"), { size: 1024, scale: 0.6, bg: "#ffffff" }),
  // Android adaptive icon: the mark inside the safe zone; the white background is set in app.config.ts.
  square(out("adaptive-icon.png"), { size: 1024, scale: 0.5 }),
  // Android 13+ themed icons: only the shape counts.
  square(out("adaptive-monochrome.png"), { size: 1024, scale: 0.5, color: "#000000" }),
  // Splash: blue mark on the light splash, white mark on the dark one.
  square(out("splash-icon.png"), { size: 512, scale: 0.9 }),
  square(out("splash-icon-dark.png"), { size: 512, scale: 0.9, color: "#ffffff" }),
  // Status-bar notification icon: white on transparent (Android tints it).
  square(out("notification-icon.png"), { size: 96, scale: 0.8, color: "#ffffff" }),
  // Web favicon (expo start --web).
  square(out("favicon.png"), { size: 48, scale: 0.72, bg: "#ffffff", radius: 10 }),
]);
console.log(`icons written to apps/mobile/assets (mark ${BLUE})`);
