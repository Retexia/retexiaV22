"use server";

import { createAdminSchemaClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";

const lf = () => createAdminSchemaClient("lingo_feeder");
const done = (message: string): ActionResult => {
  revalidatePath("/products/feeder");
  return { ok: true, message };
};

const sellerInput = z.object({
  user_id: z.string().uuid(),
  budget: z.string().trim().transform((v) => (v === "" ? null : Number(v))).refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 1000), "US$ 0–1000, or empty for the default"),
  status: z.enum(["setup", "live", "paused", "blocked"]),
});
/** A seller's monthly AI allowance (US$, empty = the default) and status (blocked = Lingo stops for them). */
export async function setLfSeller(raw: z.input<typeof sellerInput>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = sellerInput.parse(raw);
    const db = lf();
    const { data: before } = await db.from("sellers").select("ai_budget_usd, status").eq("user_id", d.user_id).maybeSingle();
    if (!before) return { ok: false, message: "Seller not found." };
    const { error } = await db.from("sellers").update({ ai_budget_usd: d.budget, status: d.status, budget_note_at: null }).eq("user_id", d.user_id);
    if (error) return { ok: false, message: dbMessage(error) };
    await audit(staff, {
      action: "feeder.lingo_feeder.seller", table: "lingo_feeder.sellers", recordId: d.user_id,
      summary: `AI allowance ${d.budget === null ? "default" : `US$${d.budget}`}, status ${d.status}`,
      before: { budget: before.ai_budget_usd, status: before.status }, after: { budget: d.budget, status: d.status },
    });
    return done("Saved");
  });
}

const priceInput = z.object({
  model: z.string().trim().regex(/^[a-z0-9.-]{3,60}$/, "Model id, e.g. gpt-5.4-mini"),
  provider: z.enum(["openai", "gemini"]),
  in_per_m: z.coerce.number().min(0).max(1000),
  cached_per_m: z.coerce.number().min(0).max(1000),
  out_per_m: z.coerce.number().min(0).max(1000),
  audio_per_m: z.string().trim().transform((v) => (v === "" ? null : Number(v))).refine((v) => v === null || (Number.isFinite(v) && v >= 0), "A price or empty"),
});
/** AI prices (US$ per 1M tokens): every call's cost is worked out from these. */
export async function saveLfPrice(raw: z.input<typeof priceInput>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = priceInput.parse(raw);
    const { error } = await lf().from("model_prices").upsert(d, { onConflict: "model" });
    if (error) return { ok: false, message: dbMessage(error) };
    await audit(staff, { action: "feeder.lingo_feeder.model_price", table: "lingo_feeder.model_prices", recordId: d.model, summary: `${d.model}: in ${d.in_per_m} / cached ${d.cached_per_m} / out ${d.out_per_m}`, after: d });
    return done("Price saved");
  });
}

const model = z.string().trim().regex(/^[a-z0-9.-]{3,60}$/, "A model id like gpt-5.4-mini or gemini-3.5-flash-lite");
const settingsInput = z.object({
  ai: z.object({
    brain: model, cheap: model, ad_match: model, media: model.refine((m) => m.startsWith("gemini"), "Voice notes and photos need a Gemini model"),
    fallback: model.refine((m) => m.startsWith("gemini"), "The fallback must be a Gemini model"),
    openai_reasoning: z.enum(["none", "minimal", "low"]), openai_cache_24h: z.boolean(), gemini_thinking: z.enum(["minimal", "low"]),
  }),
  allowance: z.object({ usd: z.coerce.number().min(0).max(1000), cheap_until: z.coerce.number().min(1).max(10) }),
  money: z.object({
    usd_to_lkr: z.coerce.number().min(1).max(10000), fixed_costs_lkr: z.coerce.number().min(0).max(10_000_000),
    payment_fee_pct: z.coerce.number().min(0).max(30), target_margin_pct: z.coerce.number().min(0).max(95),
  }),
});
/** Models, the AI allowance and the money settings (lingo_feeder.settings). */
export async function saveLfSettings(raw: z.input<typeof settingsInput>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = settingsInput.parse(raw);
    const db = lf();
    const { data: rows } = await db.from("settings").select("key, value").in("key", ["ai", "allowance", "money"]);
    const before = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
    for (const key of ["ai", "allowance", "money"] as const) {
      const { error } = await db.from("settings").update({ value: { ...(before[key] ?? {}), ...d[key] } }).eq("key", key);
      if (error) return { ok: false, message: dbMessage(error) };
    }
    await audit(staff, { action: "feeder.lingo_feeder.settings", table: "lingo_feeder.settings", recordId: "ai,allowance,money", summary: `Brain ${d.ai.brain}, allowance US$${d.allowance.usd}, 1 US$ = Rs. ${d.money.usd_to_lkr}`, before, after: d });
    return done("Settings saved. The next message uses them.");
  });
}

/** RFC 4180 CSV. */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
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
  const [head = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])) as Record<string, string>);
}

/** The products CSV (finished descriptions export) → lingo_feeder.products, the same as scripts/lingo-feeder-catalog.mjs. */
export async function importLfCatalog(form: FormData): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose the products CSV file." };
    if (file.size > 5_000_000) return { ok: false, message: "That file is too big (max 5 MB)." };
    const rows = parseCsv(await file.text());
    const clean = (v: unknown) => String(v ?? "").replace(/\r/g, "").trim();
    const num = (v: unknown, d: number) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) && n >= 0 ? n : d; };
    const out = new Map<number, Record<string, unknown>>();
    for (const r of rows) {
      const id = Number(r.product_id_feeder ?? r.product_id);
      if (!Number.isInteger(id) || id <= 0 || !clean(r.product_name)) continue;
      const long = clean(r.long_description)
        .replace(/^(.*(?:💰|මිල|Price).*?)(?:Rs\.?|රු\.?)\s*[\d,]+(?:\.\d+)?/m, "$1Rs. {price}")
        .replace(/^(.*(?:🚚|Delivery).*?)(?:Rs\.?|රු\.?)\s*[\d,]+(?:\.\d+)?/m, "$1Rs. {delivery_fee}");
      const pic = clean(r.picture_url);
      out.set(id, {
        product_id: id, name: clean(r.product_name).slice(0, 200), short_description: clean(r.short_description) || null,
        long_description: Array.from(long).slice(0, 1024).join("") || null, price: num(r.price, 0), delivery_fee: num(r.delivery_fee, 450),
        ingredients: clean(r.ingredients) || null, how_to_use: clean(r.application) || null, precautions: clean(r.precautions) || null,
        benefits: clean(r.symptoms) || null, aliases: clean(r.aliases) || null, keywords: clean(r.word_description) || null,
        ...(/^https:\/\//.test(pic) ? { picture_url: pic } : {}), active: clean(r.active) !== "false", updated_at: new Date().toISOString(),
      });
    }
    if (!out.size) return { ok: false, message: "No products found. The CSV needs product_id_feeder, product_name, long_description… (the finished descriptions export)." };
    const list = [...out.values()];
    for (let i = 0; i < list.length; i += 100) {
      const { error } = await lf().from("products").upsert(list.slice(i, i + 100), { onConflict: "product_id" });
      if (error) return { ok: false, message: dbMessage(error) };
    }
    await audit(staff, { action: "feeder.lingo_feeder.catalog", table: "lingo_feeder.products", recordId: file.name.slice(0, 80), summary: `Catalogue imported: ${list.length} products` });
    return done(`${list.length} products updated.`);
  });
}

/** Opens every product photo link; the broken ones are removed (Lingo then sends that description as text). */
export async function checkLfPhotos(): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const db = lf();
    const { data } = await db.from("products").select("product_id, name, picture_url").not("picture_url", "is", null);
    const broken: { product_id: number; name: string; picture_url: string }[] = [];
    await Promise.all((data ?? []).map(async (p) => {
      try {
        const res = await fetch(p.picture_url as string, { method: "GET", headers: { range: "bytes=0-1023" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
        if (!res.ok || !/^image\//.test(res.headers.get("content-type") ?? "")) broken.push(p as (typeof broken)[number]);
      } catch {
        broken.push(p as (typeof broken)[number]);
      }
    }));
    if (broken.length) {
      const { error } = await db.from("products").update({ picture_url: null }).in("product_id", broken.map((b) => b.product_id));
      if (error) return { ok: false, message: dbMessage(error) };
      await audit(staff, { action: "feeder.lingo_feeder.photos", table: "lingo_feeder.products", recordId: broken.map((b) => b.product_id).join(","), summary: `Broken photo links removed: ${broken.map((b) => b.name).join(", ")}`, before: { links: broken.map((b) => b.picture_url) } });
    }
    return done(broken.length ? `${broken.length} broken photo link${broken.length === 1 ? "" : "s"} removed: ${broken.map((b) => b.name).join(", ")}. Upload a working photo link with the next CSV.` : `All ${(data ?? []).length} photos open.`);
  });
}
