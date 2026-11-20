import "server-only";

import { cache } from "react";
import { getFeeder, requireFeederPage } from "../access";
import { botDb } from "./db";

export const LINGO_SLUG = "lingo";

export type Seller = {
  lingo_user_id: number;
  business_name: string;
  status: "setup" | "live" | "paused" | "blocked";
  timezone: string;
  default_lang: "si" | "sg" | "en";
  reply_to_non_ad: boolean;
  order_fields: string[];
  batch_seconds: number;
  followups: { hours?: number; from?: number; to?: number; confirmed?: boolean; cancelled?: boolean; no_order?: boolean };
  handoff_pause_hours: number;
  banned_claims: string[];
  shop_phone: string | null;
  shop_address: string | null;
  delivery_days: number;
  disabled_rules: number[];
  hidden_faqs: number[];
  ai_monthly_budget_usd: number;
};
export type WaNumber = {
  phone_number_id: string;
  waba_id: string | null;
  display_phone: string | null;
  verified_name: string | null;
  connect_mode: string;
  status: "pending" | "connected" | "problem" | "disabled";
  quality_rating: string | null;
  verify_token: string;
  token_last4: string | null;
  problem: string | null;
  last_webhook_at: string | null;
  last_check_at: string | null;
};
export type Budget = { used: number; limit: number; warn: boolean; degrade: boolean };

const SELLER_COLS =
  "lingo_user_id, status, timezone, default_lang, reply_to_non_ad, order_fields, batch_seconds, followups, handoff_pause_hours, banned_claims, shop_phone, shop_address, delivery_days, disabled_rules, hidden_faqs, ai_monthly_budget_usd";
const NUMBER_COLS =
  "phone_number_id, waba_id, display_phone, verified_name, connect_mode, status, quality_rating, verify_token, token_last4, problem, last_webhook_at, last_check_at";

async function sellerId(userId: string, name: string) {
  const db = botDb();
  const { data, error } = await db.rpc("ensure_seller", { p_user: userId, p_name: name || null });
  if (error) throw new Error(`Lingo seller: ${error.message}`);
  return Number(data);
}

async function load(id: number) {
  const db = botDb();
  const [{ data: s, error }, { data: u }, { data: n }, { data: budget }] = await Promise.all([
    db.from("bot_sellers").select(SELLER_COLS).eq("lingo_user_id", id).single(),
    db.from("lingo_users").select("business_name").eq("id", id).single(),
    db.from("wa_numbers").select(NUMBER_COLS).eq("lingo_user_id", id).maybeSingle(),
    db.rpc("seller_budget", { p_seller: id }),
  ]);
  if (error || !s) throw new Error(`Lingo seller: ${error?.message ?? "missing"}`);
  const seller = { ...(s as Omit<Seller, "business_name">), business_name: u?.business_name ?? "", ai_monthly_budget_usd: Number(s.ai_monthly_budget_usd) } as Seller;
  const b = (budget ?? {}) as Partial<Budget>;
  return { seller, number: (n as WaNumber | null) ?? null, budget: { used: Number(b.used ?? 0), limit: Number(b.limit ?? 0), warn: Boolean(b.warn), degrade: Boolean(b.degrade) } };
}

/**
 * For Lingo pages: the signed-in Feeder customer (or the customer a Retexia admin opened in
 * support mode) with Lingo on their account → their seller account (made on first visit, with
 * their My products as Lingo products). null when Lingo isn't on the account (the layout shows
 * the locked card). Cached per request.
 */
export const lingoContext = cache(async (path = "/lingo") => {
  const feeder = await requireFeederPage(path);
  const pkg = feeder.packages.find((p) => p.slug === LINGO_SLUG) ?? null;
  if (!pkg?.owned) return { feeder, pkg, ctx: null };
  const id = await sellerId(feeder.user.id, feeder.user.name);
  await botDb().rpc("sync_feeder_products", { p_seller: id });
  const { seller, number, budget } = await load(id);
  return { feeder, pkg, ctx: { userId: feeder.user.id, id, seller, number, budget } };
});
export type LingoCtx = NonNullable<Awaited<ReturnType<typeof lingoContext>>["ctx"]>;

/** For server actions: the seller id of the caller (never from the request). */
export async function lingoActor() {
  const feeder = await getFeeder();
  if (!feeder) return null;
  if (!feeder.packages.some((p) => p.slug === LINGO_SLUG && p.owned)) return null;
  return { userId: feeder.user.id, id: await sellerId(feeder.user.id, feeder.user.name) };
}

// ---------------------------------------------------------------------------
// Reads (always filtered by the seller id)
// ---------------------------------------------------------------------------

export type Overview = {
  chats_today: number; new_today: number; orders_today: number; chats_period: number; orders_period: number; sales_period: number;
  needs_you: number; to_export: number; ai_today: number; ai_period: number; billable: number;
  budget: Budget; routes: Record<string, number>; ai_by_stage: Record<string, number>; daily: { day: string; messages: number; orders: number }[];
};
export async function overview(id: number, days = 30): Promise<Overview> {
  const { data, error } = await botDb().rpc("panel_overview", { p_seller: id, p_days: days });
  if (error) throw new Error(`Lingo overview: ${error.message}`);
  return data as Overview;
}

export type InboxItem = {
  phone: string; name: string | null; stage: string; needs_seller: boolean; handoff_reason: string | null; paused_until: string | null;
  last_in_at: string | null; last_msg_at: string | null; lang: string; product: string | null;
  last: { role: string; content: string; at: string } | null;
};
export async function inbox(id: number, filter: string, limit = 150): Promise<InboxItem[]> {
  const { data, error } = await botDb().rpc("panel_inbox", { p_seller: id, p_filter: filter, p_limit: limit });
  if (error) throw new Error(`Lingo inbox: ${error.message}`);
  return (data ?? []) as InboxItem[];
}

export type ChatMessage = { id: number; role: "c" | "b" | "seller"; content: string; route: string | null; rating: number | null; correction: string | null; status: string | null; created_at: string; meta: Record<string, unknown> | null };
export type OrderRow = {
  id: number; phone: string; product_id: number | null; product_id_feeder: number | null; product_name: string | null; qty: number;
  name: string | null; address: string | null; contact: string | null; unit_price: number | null; delivery_fee: number | null; total: number | null;
  status: "draft" | "confirmed" | "cancelled"; delivery_status: string | null; feeder_sync: string; exported_at: string | null;
  ad_id: string | null; confirmed_at: string | null; created_at: string; updated_at: string;
};
export async function chat(id: number, phone: string) {
  const db = botDb();
  const [{ data: customer }, { data: messages }, { data: order }] = await Promise.all([
    db.from("bot_customers").select("*").eq("lingo_user_id", id).eq("phone", phone).eq("test", false).maybeSingle(),
    db.from("bot_messages").select("id, role, content, route, rating, correction, status, created_at, meta").eq("lingo_user_id", id).eq("phone", phone).order("id", { ascending: false }).limit(200),
    db.from("bot_orders").select("*").eq("lingo_user_id", id).eq("phone", phone).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!customer) return null;
  const product = customer.product_id
    ? (await db.from("lingo_products").select("id, name, price, delivery_fee, image_url, feeder_id").eq("lingo_user_id", id).eq("id", customer.product_id).maybeSingle()).data
    : null;
  return { customer, messages: ((messages ?? []) as ChatMessage[]).reverse(), order: (order as OrderRow | null) ?? null, product };
}

export async function orders(id: number, filter: string, limit = 300): Promise<(OrderRow & { customer_name: string | null })[]> {
  let q = botDb().from("bot_orders").select("*").eq("lingo_user_id", id).eq("test", false).order("created_at", { ascending: false }).limit(limit);
  if (filter === "export") q = q.eq("status", "confirmed").eq("feeder_sync", "pending");
  else if (filter === "confirmed") q = q.eq("status", "confirmed");
  else if (filter === "draft") q = q.eq("status", "draft");
  else if (filter === "cancelled") q = q.eq("status", "cancelled");
  const { data, error } = await q;
  if (error) throw new Error(`Lingo orders: ${error.message}`);
  return ((data ?? []) as OrderRow[]).map((o) => ({ ...o, customer_name: o.name }));
}

export type ResolvedProduct = {
  id: number; name: string; aliases: string; symptoms: string; price: number; delivery_fee: number; short_info: string; long_description: string;
  image_url: string | null; ingredients: string; usage: string; precautions: string; feeder_id: number | null; facts_hash: string; active: boolean;
};
export const PRODUCT_FIELDS = ["product_name", "short_description", "long_description", "ingredients", "application", "precautions", "symptoms", "aliases", "picture_url"] as const;
const PRODUCT_SELECT: string = `id, price, delivery_fee, product_id_feeder, active, ${PRODUCT_FIELDS.join(", ")}`;
export type ProductOwn = Record<(typeof PRODUCT_FIELDS)[number], string | null> & { id: number; price: number; delivery_fee: number | null; product_id_feeder: number | null; active: boolean };
export type ProductShared = Partial<Record<"short_description" | "long_description" | "ingredients" | "application" | "precautions" | "symptoms" | "aliases" | "picture_url", string | null>>;

export async function products(id: number) {
  const db = botDb();
  const [{ data: resolved }, { data: own }] = await Promise.all([
    db.from("lingo_products").select("*").eq("lingo_user_id", id).order("name"),
    db.from("products").select(PRODUCT_SELECT).eq("lingo_user_id", id),
  ]);
  const ownRows = (own ?? []) as unknown as ProductOwn[];
  const feederIds = ownRows.map((p) => p.product_id_feeder).filter((x): x is number => Boolean(x));
  const [{ data: shared }, { data: faqCounts }, { data: ads }] = await Promise.all([
    feederIds.length ? db.from("product_content").select("*").in("product_id_feeder", feederIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    db.from("product_faqs").select("product_id, product_id_feeder, lingo_user_id").eq("active", true).or(`lingo_user_id.is.null,lingo_user_id.eq.${id}`),
    db.from("bot_ads").select("product_id").eq("lingo_user_id", id),
  ]);
  const sharedBy = new Map((shared ?? []).map((c) => [Number(c.product_id_feeder), c as ProductShared]));
  const ownBy = new Map(ownRows.map((p) => [Number(p.id), p]));
  return ((resolved ?? []) as ResolvedProduct[]).map((p) => ({
    ...p,
    price: Number(p.price),
    delivery_fee: Number(p.delivery_fee),
    own: ownBy.get(Number(p.id)) ?? null,
    shared: p.feeder_id ? (sharedBy.get(Number(p.feeder_id)) ?? null) : null,
    faqs: (faqCounts ?? []).filter((f) => Number(f.product_id) === Number(p.id) || (f.product_id == null && p.feeder_id && Number(f.product_id_feeder) === Number(p.feeder_id))).length,
    ads: (ads ?? []).filter((a) => Number(a.product_id) === Number(p.id)).length,
  }));
}
export type ProductItem = Awaited<ReturnType<typeof products>>[number];

export type Faq = { id: number; lingo_user_id: number | null; product_id: number | null; product_id_feeder: number | null; question_en: string; variants: string[]; answer_si: string | null; answer_en: string | null; hits: number; source: string; active: boolean };
export async function faqs(id: number, feederIds: number[], productIds: number[]) {
  const db = botDb();
  const or = [`and(lingo_user_id.eq.${id})`];
  if (feederIds.length) or.push(`and(lingo_user_id.is.null,product_id_feeder.in.(${feederIds.join(",")}))`);
  const { data } = await db.from("product_faqs").select("*").or(or.join(",")).order("hits", { ascending: false }).limit(1000);
  const list = ((data ?? []) as Faq[]).filter((f) => f.lingo_user_id === id || (f.product_id_feeder && feederIds.includes(f.product_id_feeder)));
  const { data: cached } = await db
    .from("answer_cache")
    .select("key, product_id, product_id_feeder, t, lang, q, answer, hits")
    .gte("hits", 5)
    .eq("promoted", false)
    .in("product_id", productIds.length ? productIds : [-1])
    .order("hits", { ascending: false })
    .limit(30);
  return { list, suggestions: (cached ?? []) as { key: string; product_id: number; product_id_feeder: number | null; t: string; lang: string; q: string; answer: string; hits: number }[] };
}

export async function ads(id: number) {
  const db = botDb();
  const [{ data: list }, { data: chats }, { data: ords }] = await Promise.all([
    db.from("bot_ads").select("*").eq("lingo_user_id", id).order("created_at", { ascending: false }).limit(200),
    db.from("bot_customers").select("ad_id").eq("lingo_user_id", id).eq("test", false).not("ad_id", "is", null).limit(10000),
    db.from("bot_orders").select("ad_id").eq("lingo_user_id", id).eq("test", false).eq("status", "confirmed").not("ad_id", "is", null).limit(10000),
  ]);
  const count = (rows: { ad_id: string | null }[] | null, ad: string) => (rows ?? []).filter((r) => r.ad_id === ad).length;
  return (list ?? []).map((a) => ({ ...a, chats: count(chats, a.ad_id), orders: count(ords, a.ad_id) })) as {
    ad_id: string; product_id: number | null; headline: string | null; body: string | null; source_url: string | null; auto_matched: boolean; match_tried: boolean; created_at: string; chats: number; orders: number;
  }[];
}

export async function fixedTexts(id: number) {
  const { data } = await botDb().from("bot_fixed_messages").select("key, lingo_user_id, text_si, text_en, note").or(`lingo_user_id.is.null,lingo_user_id.eq.${id}`);
  const defaults: Record<string, { si: string; en: string; note: string | null }> = {};
  const own: Record<string, { si: string; en: string }> = {};
  for (const r of data ?? []) {
    if (r.lingo_user_id === null) defaults[r.key] = { si: r.text_si, en: r.text_en, note: r.note };
    else own[r.key] = { si: r.text_si, en: r.text_en };
  }
  return { defaults, own };
}

export async function quickRules(id: number) {
  const { data } = await botDb().from("quick_rules").select("*").or(`lingo_user_id.is.null,lingo_user_id.eq.${id}`).order("priority");
  return (data ?? []) as { id: number; lingo_user_id: number | null; pattern: string; stage_in: string[]; k: string; t: string | null; priority: number; enabled: boolean; hits: number; note: string | null }[];
}
