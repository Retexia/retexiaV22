import "server-only";

import { requestDesign } from "./n8n";
import { PLAN_LIMITS } from "./plans";
import { postDb } from "./post-db";
import type { BusinessRow, PlanItemRow, ProductRow, Settings } from "./post-db.types";

/**
 * Nightly batch (product spec): around 1 AM in each business's time zone,
 * prepare today's three feed posts. Brief priority per slot: an active offer,
 * then the week plan, then an AI idea from the products (rotating, never the
 * same product twice in a row). Each slot is one call to the n8n workflow's
 * webhook; it saves the post as "ready" in the next free slot (the database
 * sets its slot time) and the publisher posts it then, unless the owner denies it.
 */

const ANGLES = [
  "Show the product in an appetising, real-life setting and explain why customers love it",
  "Share a short, useful tip related to the product",
  "A friendly behind-the-scenes look at how the business makes or prepares it",
  "Highlight a customer favourite with a clear call to message or visit",
  "Remind people what the business offers and how to order",
];

const money = (p: Pick<ProductRow, "price" | "currency">) => (p.price == null ? "" : ` (${p.currency} ${Number(p.price).toLocaleString("en-US")})`);

function offerPrompt(o: PlanItemRow, date: string) {
  const d = (o.details ?? {}) as { title?: string; price?: string | null; discount?: string | null };
  const ends = o.end_date === date ? "today" : `on ${new Date(`${o.end_date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`;
  return [`Offer post: ${d.title ?? "Special offer"}.`, o.note, d.price ? `Price: ${d.price}.` : null, d.discount ? `Discount: ${d.discount}.` : null, `Add a short urgency line near the end: the offer ends ${ends}.`]
    .filter(Boolean)
    .join(" ");
}

export async function runNightlyBatch() {
  const db = postDb();
  const { data: claimed, error } = await db.rpc("claim_batch_businesses");
  if (error) throw new Error(error.message);
  const summary = { businesses: claimed?.length ?? 0, requested: 0, skipped: 0 };

  for (const { business_id, local_date } of claimed ?? []) {
    const [{ data: b }, { count: accounts }, { data: usage }, { data: items }, { data: products }, { data: existing }, { data: recent }] = await Promise.all([
      db.from("businesses").select("*").eq("id", business_id).single(),
      db.from("social_accounts").select("id", { count: "exact", head: true }).eq("business_id", business_id).eq("enabled", true).eq("status", "connected"),
      db.from("usage_monthly").select("images").eq("business_id", business_id).eq("period", `${local_date.slice(0, 7)}-01`).maybeSingle(),
      db.from("plan_items").select("*").eq("business_id", business_id).eq("active", true).lte("start_date", local_date).gte("end_date", local_date),
      db.from("products").select("id, name, price, currency, description").eq("business_id", business_id).eq("active", true).limit(60),
      db.from("posts").select("slot").eq("business_id", business_id).eq("local_date", local_date).eq("is_story", false),
      db.from("posts").select("brief").eq("business_id", business_id).order("created_at", { ascending: false }).limit(9),
    ]);
    const business = b as BusinessRow | null;
    if (!business) continue;
    const settings = (business.settings ?? {}) as Partial<Settings>;
    if (!accounts) {
      await db.from("events").insert({ business_id, type: "batch_skipped", payload: { reason: "no_accounts", local_date } });
      summary.skipped++;
      continue;
    }
    const left = Math.max(0, PLAN_LIMITS[business.plan].images - (usage?.images ?? 0));
    if (!left) {
      await db.from("events").insert({ business_id, type: "batch_skipped", payload: { reason: "allowance_used", local_date } });
      summary.skipped++;
      continue;
    }

    const taken = new Set((existing ?? []).map((p) => p.slot));
    const offers = ((items ?? []) as PlanItemRow[]).filter((i) => i.type === "offer");
    const notes = settings.week_plan_enabled && PLAN_LIMITS[business.plan].weekPlan ? ((items ?? []) as PlanItemRow[]).filter((i) => i.type === "week_note") : [];
    const recentProducts = new Set((recent ?? []).map((r) => (r.brief as { product?: string } | null)?.product).filter(Boolean));
    const pool = ((products ?? []) as ProductRow[]).filter((p) => !recentProducts.has(p.name));
    const rotation = pool.length ? pool : ((products ?? []) as ProductRow[]);
    let offerSlotsUsed = 0;
    let budget = left;

    for (const slot of [1, 2, 3]) {
      if (taken.has(slot) || budget <= 0) continue;
      const offer = offers.find((o) => offerSlotsUsed < (o.slots_per_day ?? 1));
      const note = notes.find((n) => n.slot === slot || n.slot === null);
      let prompt: string;
      if (offer) {
        prompt = offerPrompt(offer, local_date);
        offerSlotsUsed++;
      } else if (note?.note) {
        prompt = note.note;
      } else {
        const day = Number(local_date.replace(/-/g, ""));
        const product = rotation.length ? rotation[(day + slot) % rotation.length] : null;
        const angle = ANGLES[(day + slot) % ANGLES.length]!;
        prompt = product ? `${angle}: ${product.name}${money(product)}.${product.description ? ` ${product.description.slice(0, 200)}` : ""}` : `${angle}, for ${business.name}.`;
      }
      const r = await requestDesign({ business_id, prompt, publish: false });
      if (r.ok) {
        summary.requested++;
        budget--;
      } else {
        await db.from("events").insert({ business_id, type: "batch_error", payload: { slot, error: r.error } });
      }
    }
  }
  return summary;
}
