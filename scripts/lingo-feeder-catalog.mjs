// Product catalogue for Lingo Feeder: a products CSV (the export of the finished descriptions,
// columns product_id_feeder, product_name, short_description, long_description, price, delivery_fee,
// ingredients, application, precautions, symptoms, aliases, word_description, picture_url, active)
// → supabase/migrations/0040_lingo_feeder_catalog.sql (insert or update every product).
//
// The price and delivery lines in each description become {price} / {delivery_fee}, so every seller's
// own price is shown. Run it again with a newer CSV and run the new SQL in Supabase.
//
//   node scripts/lingo-feeder-catalog.mjs ~/Downloads/finished_descriptions_all_products.csv
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/lingo-feeder-catalog.mjs <products.csv>");
  process.exit(1);
}

/** RFC 4180 CSV (quoted fields with commas, quotes and line breaks). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

const sql = (v) => (v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const clean = (v) => String(v ?? "").replace(/\r/g, "").trim();
const num = (v, d) => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && n >= 0 ? n : d; };

const rows = parseCsv(readFileSync(file, "utf8"));
const seen = new Set();
const values = [];
const problems = [];
for (const r of rows) {
  const id = Number(r.product_id_feeder);
  if (!Number.isInteger(id) || id <= 0) { problems.push(`no Feeder product id: ${r.product_name}`); continue; }
  if (seen.has(id)) { problems.push(`duplicate Feeder product id ${id}: ${r.product_name}`); continue; }
  seen.add(id);
  const long = clean(r.long_description)
    .replace(/^(.*(?:💰|මිල|Price).*?)(?:Rs\.?|රු\.?)\s*[\d,]+(?:\.\d+)?/m, "$1Rs. {price}")
    .replace(/^(.*(?:🚚|Delivery).*?)(?:Rs\.?|රු\.?)\s*[\d,]+(?:\.\d+)?/m, "$1Rs. {delivery_fee}");
  if (!long.includes("{price}")) problems.push(`price line not found (kept as written): ${r.product_name}`);
  if (Array.from(long).length > 1024) problems.push(`description longer than WhatsApp's 1024 characters (cut): ${r.product_name}`);
  const picture = /^https:\/\//.test(clean(r.picture_url)) ? clean(r.picture_url) : null;
  values.push(
    `(${id}, ${sql(clean(r.product_name))}, ${sql(clean(r.short_description))}, ${sql(Array.from(long).slice(0, 1024).join(""))}, ` +
      `${num(r.price, 0)}, ${num(r.delivery_fee, 450)}, ${sql(clean(r.ingredients))}, ${sql(clean(r.application))}, ${sql(clean(r.precautions))}, ` +
      `${sql(clean(r.symptoms))}, ${sql(clean(r.aliases))}, ${sql(clean(r.word_description))}, ${sql(picture)}, ${String(r.active).trim() !== "false"})`,
  );
}

const out = `-- =====================================================================
-- 0040: Lingo Feeder product catalogue (${values.length} products), made from the products CSV by
-- scripts/lingo-feeder-catalog.mjs. Prices and delivery in the descriptions are {price} /
-- {delivery_fee}: every seller's own price is filled in when Lingo sends it.
-- Safe to run again: products are updated, FAQs added in Supabase are kept. Run after 0039.
-- =====================================================================
insert into lingo_feeder.products (product_id, name, short_description, long_description, price, delivery_fee, ingredients,
                                   how_to_use, precautions, benefits, aliases, keywords, picture_url, active) values
${values.join(",\n")}
on conflict (product_id) do update set
  name = excluded.name, short_description = excluded.short_description, long_description = excluded.long_description,
  price = excluded.price, delivery_fee = excluded.delivery_fee, ingredients = excluded.ingredients, how_to_use = excluded.how_to_use,
  precautions = excluded.precautions, benefits = excluded.benefits, aliases = excluded.aliases, keywords = excluded.keywords,
  picture_url = coalesce(excluded.picture_url, lingo_feeder.products.picture_url), active = excluded.active, updated_at = now();
`;
const target = new URL("../supabase/migrations/0040_lingo_feeder_catalog.sql", import.meta.url);
writeFileSync(target, out);
console.log(`${values.length} products → supabase/migrations/0040_lingo_feeder_catalog.sql`);
for (const p of problems) console.log("  ! " + p);
