// Collects every t("key", "Fallback") call in apps/web and writes them into
// supabase/seed.sql between the @strings markers (as site_strings rows), and
// lists them in packages/content/src/string-keys.json for the admin.
//
//   node scripts/extract-strings.mjs
//
// Keys found with two different fallbacks are reported so they can be unified.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const dirs = ["apps/web/app", "apps/web/components", "apps/web/lib", "packages/forms/src"];
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(tsx?|mts)$/.test(name)) files.push(full);
  }
}
dirs.forEach((d) => walk(join(root, d)));

const re = /\bt\(\s*"([a-z0-9_.]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g;
const strings = new Map();
const conflicts = [];
for (const file of files) {
  // Ignore examples in comments (e.g. t("some.key", "…") in docs).
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of src.matchAll(re)) {
    const [, key, raw] = m;
    const value = JSON.parse(`"${raw}"`);
    if (strings.has(key) && strings.get(key).value !== value) conflicts.push(`${key}: "${strings.get(key).value}" vs "${value}"`);
    if (!strings.has(key)) strings.set(key, { value, file: file.replace(root, "") });
  }
}

const esc = (s) => s.replace(/'/g, "''");
const rows = [...strings.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, { value, file }]) => `  ('${esc(key)}', '${esc(value)}', 'Used in ${esc(file)}')`);
const sql = `insert into public.site_strings (key, value, description) values
${rows.join(",\n")}
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description;`;

const seedPath = join(root, "supabase/seed.sql");
const seed = readFileSync(seedPath, "utf8");
const start = "-- @strings:start";
const end = "-- @strings:end";
const next = seed.replace(new RegExp(`${start}[\\s\\S]*${end}`), `${start}\n${sql}\n${end}`);
writeFileSync(seedPath, next);
console.log(`site_strings: ${strings.size} keys written to supabase/seed.sql`);

// The admin's "Text and labels" screen compares these keys with site_strings.
const keysPath = join(root, "packages/content/src/string-keys.json");
writeFileSync(
  keysPath,
  JSON.stringify(
    [...strings.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, { value, file }]) => ({ key, fallback: value, file })),
    null,
    2,
  ) + "\n",
);
console.log(`string keys written to packages/content/src/string-keys.json`);
if (conflicts.length) {
  console.warn(`\n${conflicts.length} keys have different fallbacks in different files:\n  ${conflicts.join("\n  ")}`);
  process.exitCode = 1;
}
