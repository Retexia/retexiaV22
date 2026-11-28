import "server-only";

import { gateway, gatewayReady } from "../autopublish/gateway";
import { feederDb } from "../db";
import { lfDb } from "../lingo-feeder/db";
import { AI_BATCH, buildAiRequest, readAiAnswer, type AiBusiness, type AiComment, type AiPost, type AiProduct, type AiResult } from "./ai-prompt";
import type { CommentSettings } from "./rules";

/**
 * What the AI knows about a seller: the shared business details (feeder.customers, the same ones
 * Lingo Feeder uses), and the products: their own (My products) plus the ones the ads / posts are
 * about (matched from the post text), with everything Lingo Feeder knows (lingo_feeder.catalog:
 * the seller's price and delivery fee, description, benefits, how to use, FAQs). And their Lingo
 * Feeder WhatsApp number, so the private message can send the customer to Lingo to order.
 */
export async function sellerFacts(userId: string, postTexts: string[] = []): Promise<{ business: AiBusiness; products: AiProduct[]; likely: Map<string, number>; whatsapp: string | null }> {
  const db = feederDb();
  const lf = lfDb();
  const [{ data: c }, { data: mine }, cat, num] = await Promise.all([
    db.from("customers").select("business_name, location, phone, delivery_days, call_hours, about").eq("user_id", userId).maybeSingle(),
    db.from("customer_products").select("product_id").eq("user_id", userId).limit(60),
    lf.rpc("catalog", { p_user: userId }).then((r) => r, () => ({ data: null, error: true })),
    lf.from("numbers").select("display_phone, status").eq("user_id", userId).maybeSingle().then((r) => r.data, () => null),
  ]);
  type Cat = { id: number; name: string; price: number; delivery_fee: number; enabled: boolean; short_description: string | null; benefits: string | null; how_to_use: string | null; aliases: string | null; faqs: { q: string; a: string }[] | null };
  const catalog = ((cat as { data: Cat[] | null }).data ?? []).filter((p) => p.enabled);
  // Which product each ad / post is about (Lingo Feeder's own matcher).
  const likely = new Map<string, number>();
  for (const t of [...new Set(postTexts.map((x) => x.trim()).filter(Boolean))].slice(0, 10)) {
    const { data } = await lf.rpc("match_products", { p_user: userId, p_text: t.slice(0, 1000), p_limit: 1 }).then((r) => r, () => ({ data: null }));
    const top = Array.isArray(data) ? (data[0] as { id?: number } | undefined) : undefined;
    if (top?.id) likely.set(t, top.id);
  }
  const ids = new Set<number>([...((mine ?? []) as { product_id: number }[]).map((r) => r.product_id), ...likely.values()]);
  const cut = (t: string | null | undefined, n: number) => (t ?? "").replace(/\*([^*\n]+)\*/g, "$1").replace(/\s+/g, " ").trim().slice(0, n) || null;
  const products: AiProduct[] = catalog
    .filter((p) => ids.has(p.id))
    .slice(0, 25)
    .map((p) => ({
      product_id: p.id,
      name: p.name,
      price: Number(p.price),
      delivery_fee: Number(p.delivery_fee),
      aliases: (p.aliases ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8),
      about: cut(p.short_description, 300),
      benefits: cut(p.benefits, 400),
      how_to_use: cut(p.how_to_use, 300),
      faqs: (p.faqs ?? []).slice(0, 4).map((f) => ({ q: cut(f.q, 120) ?? "", a: cut(f.a, 240) ?? "" })),
    }));
  const n = num as { display_phone?: string | null; status?: string } | null;
  const digits = n?.status === "connected" ? String(n.display_phone ?? "").replace(/\D/g, "") : "";
  const whatsapp = digits.length >= 9 ? (digits.startsWith("0") ? `94${digits.slice(1)}` : digits) : null;
  return {
    business: {
      business_name: (c?.business_name as string | null) ?? null,
      location: (c?.location as string | null) ?? null,
      phone: (c?.phone as string | null) ?? null,
      delivery_days: (c?.delivery_days as string | null) ?? null,
      call_hours: (c?.call_hours as string | null) ?? null,
      about: (c?.about as string | null) ?? null,
    },
    products,
    likely,
    whatsapp,
  };
}

/** The WhatsApp link to the seller's Lingo Feeder number, with the product name ready to send (Lingo finds the product from it). */
export function lingoLink(whatsapp: string | null, productName: string | null) {
  if (!whatsapp) return null;
  return `https://wa.me/${whatsapp}${productName ? `?text=${encodeURIComponent(`${productName} gena details ona`)}` : ""}`;
}

export type AiOutcome = { results: Map<string, AiResult>; tokens: number; error: string | null };

/** Asks the AI about the comments, 15 at a time. Comments it didn't answer are simply missing (the caller uses the backup replies). */
export async function askAi(input: { settings: CommentSettings; business: AiBusiness; products: AiProduct[]; posts: AiPost[]; comments: AiComment[] }): Promise<AiOutcome> {
  const results = new Map<string, AiResult>();
  let tokens = 0;
  let error: string | null = null;
  if (!input.settings.ai_on || !input.comments.length) return { results, tokens, error };
  if (!gatewayReady()) return { results, tokens, error: "Retexia's AI connection isn't set up on the server yet." };
  const productIds = input.products.map((p) => p.product_id);
  for (let i = 0; i < input.comments.length; i += AI_BATCH) {
    const batch = input.comments.slice(i, i + AI_BATCH);
    const r = await gateway(buildAiRequest({ ...input, comments: batch }), 90_000);
    if (!r.ok) {
      error = r.network ? "Retexia couldn't reach the AI just now." : `The AI didn't answer: ${String(r.body?.error?.message ?? r.status).slice(0, 200)}`;
      break;
    }
    const a = readAiAnswer(r.body, input.settings, batch.map((c) => c.id), productIds);
    a.results.forEach((v, k) => results.set(k, v));
    tokens += a.tokens;
  }
  return { results, tokens, error };
}
