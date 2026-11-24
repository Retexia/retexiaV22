// The source of one Lingo Feeder n8n Code node (n8n/lingo-feeder/src/<file>), with its
// "// @include <file>" lines replaced by those files (shared helpers, Lingo's instructions).
// Used by the workflow builder and by the tests, so both run exactly the same code.
import { readFileSync } from "node:fs";

const dir = new URL("../../n8n/lingo-feeder/src/", import.meta.url);

export function nodeSource(file) {
  const text = readFileSync(new URL(file, dir), "utf8");
  return text.replace(/^\/\/ @include ([\w.-]+)\s*$/gm, (_, inc) => readFileSync(new URL(inc, dir), "utf8").trimEnd());
}
