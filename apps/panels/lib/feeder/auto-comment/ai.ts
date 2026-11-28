import "server-only";

import { gateway, gatewayReady } from "../autopublish/gateway";
import { feederDb } from "../db";
import { lfDb } from "../lingo-feeder/db";
import { AI_BATCH, buildAiRequest, readAiAnswer, type AiBusiness, type AiComment, type AiPost, type AiProduct, type AiResult } from "./ai-prompt";
import type { CommentSettings } from "./rules";

/**
 * What the AI knows about a seller: the shared business details (feeder.customers,
 * the same ones Lingo Feeder uses) and their products (My products, with what
 * Lingo Feeder knows about each product when it's there).
 */
export async function sellerFacts(userId: string): Promise<{ business: AiBusiness; products: AiProduct[] }> {
  const db = feederDb();
  const [{ data: c }, { data: mine }] = await Promise.all([
    db.from("customers").select("business_name, location, phone, delivery_days, call_hours, about").eq("user_id", userId).maybeSingle(),
    db.from("customer_products").select("product_id, price, form_names, products(product_name, price, delivery_fee, aliases)").eq("user_id", userId).limit(60),
  ]);
  type Row = { product_id: number; price: number | null; form_names: string[] | null; products: { product_name: string; price: number; delivery_fee: number; aliases: string[] | null } | null };
  const rows = ((mine ?? []) as unknown as Row[]).filter((r) => r.products);
  // Lingo Feeder's product knowledge (the same catalogue IDs); optional.
  const about = new Map<number, string>();
  if (rows.length) {
    try {
      const { data } = await lfDb().from("products").select("product_id, short_description, benefits").in("product_id", rows.map((r) => r.product_id));
      for (const p of (data ?? []) as { product_id: number; short_description: string | null; benefits: string | null }[]) {
        about.set(p.product_id, [p.short_description, p.benefits].filter(Boolean).join(" "));
      }
    } catch {
      // Lingo Feeder's schema isn't exposed: names and prices are enough.
    }
  }
  return {
    business: {
      business_name: (c?.business_name as string | null) ?? null,
      location: (c?.location as string | null) ?? null,
      phone: (c?.phone as string | null) ?? null,
      delivery_days: (c?.delivery_days as string | null) ?? null,
      call_hours: (c?.call_hours as string | null) ?? null,
      about: (c?.about as string | null) ?? null,
    },
    products: rows.map((r) => ({
      product_id: r.product_id,
      name: r.products!.product_name,
      price: r.price != null ? Number(r.price) : Number(r.products!.price),
      delivery_fee: Number(r.products!.delivery_fee),
      aliases: [...(r.products!.aliases ?? []), ...(r.form_names ?? [])],
      about: about.get(r.product_id) ?? null,
    })),
  };
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
