import "server-only";

import { cache } from "react";
import { getFeeder, requireFeederPage } from "../access";
import type { LfChat, LfChatItem, LfMessage, LfOrder, LfStats } from "@retexia/shared/app-api";
import { lfDb } from "./db";

export const LINGO_FEEDER_SLUG = "lingo-feeder";

export type Seller = {
  user_id: string;
  business_name: string;
  phone: string | null;
  location: string | null;
  address: string | null;
  delivery_days: string;
  call_hours: string;
  about: string | null;
  ads_only: boolean;
  status: "setup" | "live" | "paused" | "blocked";
};
export type WaNumber = {
  phone_number_id: string;
  waba_id: string | null;
  display_phone: string | null;
  verified_name: string | null;
  status: "pending" | "connected" | "problem" | "disabled";
  quality_rating: string | null;
  verify_token: string;
  token_last4: string | null;
  problem: string | null;
  last_webhook_at: string | null;
  last_check_at: string | null;
};

const SELLER_COLS = "user_id, business_name, phone, location, address, delivery_days, call_hours, about, ads_only, status";
const NUMBER_COLS = "phone_number_id, waba_id, display_phone, verified_name, status, quality_rating, verify_token, token_last4, problem, last_webhook_at, last_check_at";

async function load(userId: string, name: string) {
  const db = lfDb();
  const { error: e0 } = await db.rpc("ensure_seller", { p_user: userId, p_name: name || null });
  if (e0) throw new Error(`Lingo Feeder seller: ${e0.message}`);
  const [{ data: s, error }, { data: n }] = await Promise.all([
    db.from("sellers").select(SELLER_COLS).eq("user_id", userId).single(),
    db.from("numbers").select(NUMBER_COLS).eq("user_id", userId).maybeSingle(),
  ]);
  if (error || !s) throw new Error(`Lingo Feeder seller: ${error?.message ?? "missing"}`);
  return { seller: s as Seller, number: (n as WaNumber | null) ?? null };
}

/**
 * For Lingo Feeder pages: the signed-in Feeder customer (or the customer a Retexia admin opened in
 * support mode) with Lingo Feeder on their account → their seller row (made on first visit). ctx is
 * null when the package isn't on the account (the layout shows the locked card). Cached per request.
 */
export const lingoFeederContext = cache(async (path = "/lingo-feeder") => {
  const feeder = await requireFeederPage(path);
  const pkg = feeder.packages.find((p) => p.slug === LINGO_FEEDER_SLUG) ?? null;
  if (!pkg?.owned) return { feeder, pkg, ctx: null, error: null };
  try {
    const { seller, number } = await load(feeder.user.id, feeder.user.name);
    return { feeder, pkg, ctx: { userId: feeder.user.id, seller, number }, error: null };
  } catch (e) {
    // Database not ready (migration not run, schema not exposed): the layout explains it instead of crashing.
    console.error("[lingo-feeder]", e);
    return { feeder, pkg, ctx: null, error: e instanceof Error ? e.message.slice(0, 200) : "unknown error" };
  }
});
export type LfCtx = NonNullable<Awaited<ReturnType<typeof lingoFeederContext>>["ctx"]>;

/** For server actions: the caller's user id (never from the request). */
export async function lingoFeederActor() {
  const feeder = await getFeeder();
  if (!feeder) return null;
  if (!feeder.packages.some((p) => p.slug === LINGO_FEEDER_SLUG && p.owned)) return null;
  await lfDb().rpc("ensure_seller", { p_user: feeder.user.id, p_name: feeder.user.name || null });
  return { userId: feeder.user.id };
}

// ---------------------------------------------------------------------------
// Reads (always filtered by the seller's user id)
// ---------------------------------------------------------------------------
export type Home = LfStats;
export async function home(userId: string): Promise<Home> {
  const { data, error } = await lfDb().rpc("panel_home", { p_user: userId });
  if (error) throw new Error(`Lingo Feeder home: ${error.message}`);
  return data as Home;
}

export type ChatItem = LfChatItem;
export async function chats(userId: string, status: string, q: string | null, limit = 150): Promise<ChatItem[]> {
  const { data, error } = await lfDb().rpc("panel_chats", { p_user: userId, p_status: status, p_q: q, p_limit: limit });
  if (error) throw new Error(`Lingo Feeder chats: ${error.message}`);
  return (data ?? []) as ChatItem[];
}

export type Chat = LfChat;
export type Message = LfMessage;
export type Order = LfOrder;
const ORDER_COLS = "id, phone, product_id, product_name, qty, name, address, phone1, phone2, unit_price, delivery_fee, total, status, exported_at, confirmed_at, created_at";

export async function chat(userId: string, phone: string) {
  const db = lfDb();
  const [{ data: c }, { data: msgs }, { data: orders }] = await Promise.all([
    db.from("chats").select("phone, profile_name, lang, product_id, status, status_at, needs_call, call_reason, awaiting, details, memo, paused_until, last_in_at, last_msg_at, created_at, ad_id")
      .eq("user_id", userId).eq("phone", phone).eq("test", false).maybeSingle(),
    db.from("messages").select("id, role, kind, content, meta, status, route, created_at").eq("user_id", userId).eq("phone", phone).order("id", { ascending: false }).limit(300),
    db.from("orders").select(ORDER_COLS).eq("user_id", userId).eq("phone", phone).neq("status", "draft").order("id", { ascending: false }),
  ]);
  if (!c) return null;
  const product = c.product_id ? (await db.from("products").select("product_id, name, picture_url").eq("product_id", c.product_id).maybeSingle()).data : null;
  return { chat: c as Chat, messages: ((msgs ?? []) as Message[]).reverse(), orders: (orders ?? []) as Order[], product };
}

export async function orders(userId: string, view: "new" | "sent" | "cancelled" | "all") {
  let q = lfDb().from("orders").select(ORDER_COLS).eq("user_id", userId).eq("test", false).neq("status", "draft");
  if (view === "new") q = q.eq("status", "confirmed").is("exported_at", null);
  else if (view === "sent") q = q.eq("status", "confirmed").not("exported_at", "is", null);
  else if (view === "cancelled") q = q.eq("status", "cancelled");
  const { data, error } = await q.order("id", { ascending: false }).limit(500);
  if (error) throw new Error(`Lingo Feeder orders: ${error.message}`);
  return (data ?? []) as Order[];
}

export type Product = {
  id: number; name: string; price: number; delivery_fee: number; total: number; enabled: boolean; own_price: number | null;
  short_description: string | null; long_description: string | null; how_to_use: string | null; precautions: string | null; benefits: string | null;
  ingredients: string | null; aliases: string | null; picture_url: string | null; faqs: { q: string; a: string }[];
};
export async function products(userId: string): Promise<Product[]> {
  const { data, error } = await lfDb().rpc("catalog", { p_user: userId });
  if (error) throw new Error(`Lingo Feeder products: ${error.message}`);
  return ((data ?? []) as Product[]).map((p) => ({ ...p, price: Number(p.price), delivery_fee: Number(p.delivery_fee), total: Number(p.total), own_price: p.own_price == null ? null : Number(p.own_price) }))
    .sort((a, b) => Number(Boolean(b.picture_url)) - Number(Boolean(a.picture_url)) || a.name.replace(/^[^\p{L}\p{N}]+/u, "").localeCompare(b.name.replace(/^[^\p{L}\p{N}]+/u, "")));
}

export type Ad = { ad_id: string; product_id: number | null; headline: string | null; body: string | null; source_url: string | null; matched_by: string | null; chats: number; created_at: string };
export async function ads(userId: string): Promise<Ad[]> {
  const { data } = await lfDb().from("ads").select("ad_id, product_id, headline, body, source_url, matched_by, chats, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as Ad[];
}
