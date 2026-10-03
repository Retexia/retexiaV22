// Regenerates src/tokens.css from src/tokens.ts. Run: pnpm --filter @retexia/ui tokens
import { writeFileSync } from "node:fs";
import { defaultTokens, tokensToCss } from "../src/tokens.ts";

const css = tokensToCss(defaultTokens()).replace(/;/g, ";\n  ").replace(/\{/g, " {\n  ").replace(/\s*\}/g, "\n}\n");
writeFileSync(
  new URL("../src/tokens.css", import.meta.url),
  `/* Generated from tokens.ts by scripts/build-tokens.ts. Do not edit by hand. */\n${css}`,
);
process.stdout.write("tokens.css written\n");
