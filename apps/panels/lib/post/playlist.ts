import "server-only";

import type { CaptionLanguage } from "./languages";
import { requestDesign, requestPlan, type PlanSlot } from "./n8n";
import { PLAN_LIMITS } from "./plans";
import { postDb, type PostDb } from "./post-db";
import type { BusinessRow, PlanItemRow, PostRow, ProductRow } from "./post-db.types";
import { readSettings } from "./session";
import { sendOwnerMessages } from "./whatsapp";
import { addDays, localDate, timeIn } from "../time";

/**
 * The daily playlist (product logic; the database keeps it consistent):
 *   06:00  runPlanning() writes tomorrow's playlist: one prompt per post and
 *          story slot (n8n "plan", or simple prompts if n8n is unreachable),
 *          and fills today's empty slots (the time is settings.playlist.plan_time);
 *   00:00  dispatchDesigns() sends the day's items to n8n "design" (also any
 *          item under 3 hours away), so the day is ready by 06:00;
 *   then   the publisher posts each item at its time.
 * Called every 5 minutes by the Supabase scheduler (/api/post/batch).
 */

export const PLAYLIST_SLOTS = 5;

const ANGLES = [
  "Show the product in a real-life setting and say why customers love it",
  "Share a short, useful tip related to the product",
  "A friendly behind-the-scenes look at how it is made or prepared",
  "Highlight a customer favourite with a clear call to message or visit",
  "Remind people what the business offers and how to order",
  "A seasonal or weekend idea featuring the product",
];

export const promptLanguage = (c: CaptionLanguage): "si" | "en" | "ta" => (c === "si" || c === "si_en" ? "si" : c === "ta" ? "ta" : "en");
const monthStart = (tz: string) => `${localDate(tz).slice(0, 7)}-01`;

async function imagesLeft(db: PostDb, b: BusinessRow) {
  const { data } = await db.from("usage_monthly").select("images").eq("business_id", b.id).eq("period", monthStart(b.timezone)).maybeSingle();
  return Math.max(0, PLAN_LIMITS[b.plan].images - (data?.images ?? 0));
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Writes one day's playlist into its empty slots.
 *   all:  every empty slot at its time (tomorrow's playlist);
 *   fill: today: slots whose time has passed get the next free times from
 *         20 minutes from now (every 30 minutes, until 23:50), so today is never empty.
 */
export async function planDay(db: PostDb, b: BusinessRow, date: string, mode: "all" | "fill" = "all"): Promise<number> {
  const s = readSettings(b);
  const [{ data: existing }, { data: items }, { data: products }, left] = await Promise.all([
    db.from("posts").select("slot, is_story, scheduled_at").eq("business_id", b.id).eq("local_date", date),
    db.from("plan_items").select("*").eq("business_id", b.id).eq("active", true).lte("start_date", date).gte("end_date", date),
    db.from("products").select("name, price, currency, description").eq("business_id", b.id).eq("active", true).limit(40),
    imagesLeft(db, b),
  ]);
  const taken = new Set((existing ?? []).filter((e) => e.slot <= PLAYLIST_SLOTS).map((e) => `${e.is_story ? "story" : "post"}-${e.slot}`));
  const isToday = date === localDate(b.timezone);
  const earliest = Math.ceil((minutes(timeIn(b.timezone, new Date().toISOString())) + 20) / 5) * 5;
  const offers = ((items ?? []) as PlanItemRow[]).filter((i) => i.type === "offer");
  const notes = s.week_plan_enabled && PLAN_LIMITS[b.plan].weekPlan ? ((items ?? []) as PlanItemRow[]).filter((i) => i.type === "week_note") : [];

  const slots: (PlanSlot & { slot: number; source: "ai" | "offer" | "week_plan"; plan_item_id: string | null })[] = [];
  const add = (format: "post" | "story", count: number, times: string[]) => {
    // Times already used in this lane today (items made by hand too).
    const used = new Set((existing ?? []).filter((e) => e.is_story === (format === "story")).map((e) => timeIn(b.timezone, e.scheduled_at)));
    for (let i = 1; i <= count; i++) {
      const key = `${format}-${i}`;
      let time = times[i - 1]!;
      if (taken.has(key)) continue;
      if (isToday && mode === "fill" && minutes(time) < earliest) {
        let m = earliest;
        while (m <= 23 * 60 + 50 && (used.has(hhmm(m)) || times.slice(i).includes(hhmm(m)))) m += 30;
        if (m > 23 * 60 + 50) continue;
        time = hhmm(m);
      } else if (isToday && minutes(time) < earliest) continue;
      used.add(time);
      const offer = offers.find((o) => i <= (o.slots_per_day ?? 1));
      const note = format === "post" ? notes.find((n) => n.slot === i || n.slot === null) : undefined;
      const d = (offer?.details ?? {}) as { title?: string; price?: string | null; discount?: string | null };
      const hint = offer
        ? [`Offer: ${d.title ?? "Special offer"}.`, offer.note, d.price ? `Price: ${d.price}.` : null, d.discount ? `Discount: ${d.discount}.` : null, `Ends ${offer.end_date}.`].filter(Boolean).join(" ")
        : (note?.note ?? null);
      slots.push({ key, format, time, hint, slot: i, source: offer ? "offer" : note ? "week_plan" : "ai", plan_item_id: offer?.id ?? note?.id ?? null });
    }
  };
  add("post", s.playlist.posts, s.playlist.post_times);
  add("story", s.playlist.stories, s.playlist.story_times);
  // Never plan more than this month's AI designs can make.
  const plan = slots.slice(0, left);
  if (!plan.length) {
    if (slots.length) await db.from("events").insert({ business_id: b.id, type: "playlist_skipped", payload: { date, reason: "allowance_used" } });
    return 0;
  }

  const ai = await requestPlan({
    business_id: b.id,
    date,
    caption_language: s.caption_language,
    design_language: s.design_language,
    prompt_language: promptLanguage(s.caption_language),
    slots: plan.map(({ key, format, time, hint }) => ({ key, format, time, hint })),
  });
  const list = (products ?? []) as Pick<ProductRow, "name" | "price" | "currency" | "description">[];
  const day = Number(date.replace(/-/g, ""));
  const rows = plan.map((slot, n) => {
    const p = ai?.find((x) => x.key === slot.key);
    if (p) return { ...p, slot, ai: true };
    // Fallback without AI: offer / week note, else a rotating product and angle.
    const product = list.length ? list[(day + n) % list.length]! : null;
    const angle = ANGLES[(day + n) % ANGLES.length]!;
    const prompt =
      slot.hint ??
      (product
        ? `${angle}: ${product.name}${product.price != null ? ` (${product.currency} ${Number(product.price).toLocaleString("en-US")})` : ""}.${product.description ? ` ${product.description.slice(0, 200)}` : ""}`
        : `${angle}, for ${b.name}.`);
    return { key: slot.key, title: product?.name ?? (slot.source === "offer" ? "Offer" : b.name), prompt, angle, product: product?.name ?? "", slot, ai: false };
  });
  const { data: count, error } = await db.rpc("add_planned_items", {
    p_business: b.id,
    p_date: date,
    p_items: rows.map((r) => ({
      format: r.slot.format,
      slot: r.slot.slot,
      time: r.slot.time,
      title: r.title,
      prompt: r.prompt,
      angle: r.angle,
      product: r.product,
      source: r.slot.source,
      plan_item_id: r.slot.plan_item_id,
      caption_language: s.caption_language,
      design_language: s.design_language,
    })),
  });
  if (error) throw new Error(error.message);
  await db.from("events").insert({ business_id: b.id, type: "playlist_planned", payload: { date, items: count ?? 0, ai: Boolean(ai) } });
  return count ?? 0;
}

/** 06:00 runs that are due: tomorrow's playlist (and today's, on a business's first day). */
export async function runPlanning(db: PostDb, limit = 4) {
  const { data: due, error } = await db.rpc("claim_planning_businesses", { p_limit: limit });
  if (error) throw new Error(error.message);
  // In parallel: each business waits up to ~2 minutes for the AI, and the route has 5.
  const counts = await Promise.all(
    (due ?? []).map(async (d) => {
      const { data: b } = await db.from("businesses").select("*").eq("id", d.business_id).single();
      if (!b) return 0;
      try {
        // One after the other: both count the month's remaining designs.
        const today = d.plan_today ? await planDay(db, b as BusinessRow, d.today, "fill") : 0;
        return today + (await planDay(db, b as BusinessRow, d.plan_date));
      } catch (e) {
        console.error("[playlist] planning failed", d.business_id, e);
        // Let the next run try again.
        await db.from("businesses").update({ last_plan_date: null }).eq("id", d.business_id);
        return 0;
      }
    }),
  );
  const items = counts.reduce((a, c) => a + c, 0);
  return { businesses: due?.length ?? 0, items };
}

/**
 * Today never stays empty: fills today's empty slots (late ones get the next
 * free times) and, once tomorrow's playlist exists, its empty slots too.
 */
export async function refreshPlaylist(db: PostDb, b: BusinessRow) {
  const today = localDate(b.timezone);
  let items = await planDay(db, b, today, "fill");
  if (b.last_plan_date === today) items += await planDay(db, b, addDays(today, 1));
  return items;
}

/** Sends one claimed item to n8n; on failure it goes back to "planned" (3 tries) or to the owner. */
export async function designItem(db: PostDb, post: PostRow, b: BusinessRow, publish = false) {
  const s = readSettings(b);
  const brief = (post.brief ?? {}) as { prompt?: string; title?: string; caption_language?: CaptionLanguage; design_language?: "si" | "en" | "ta"; design_attempts?: number };
  if ((await imagesLeft(db, b)) <= 0) {
    await db.rpc("design_failed", { p_post: post.id, p_error: "This month's AI designs are used up. Pick one of your own photos, or upgrade." });
    return false;
  }
  const r = await requestDesign({
    business_id: b.id,
    post_id: post.id,
    prompt: brief.prompt || brief.title || `A post for ${b.name}`,
    format: post.is_story ? "story" : "post",
    caption_language: brief.caption_language ?? s.caption_language,
    design_language: brief.design_language ?? s.design_language,
    publish,
  });
  if (r.ok) return true;
  if ((brief.design_attempts ?? 1) >= 3) await db.rpc("design_failed", { p_post: post.id, p_error: `The designer is not reachable (${r.error}).` });
  else await db.from("posts").update({ status: "planned" }).eq("id", post.id).eq("status", "generating");
  return false;
}

/** Items whose design is due (their day started, or they are under 3 hours away). */
export async function dispatchDesigns(db: PostDb, limit = 15) {
  const { data: claimed, error } = await db.rpc("claim_design_items", { p_limit: limit });
  if (error) throw new Error(error.message);
  const posts = (claimed ?? []) as PostRow[];
  const ids = [...new Set(posts.map((p) => p.business_id))];
  const { data: rows } = ids.length ? await db.from("businesses").select("*").in("id", ids) : { data: [] };
  const businesses = new Map(((rows ?? []) as BusinessRow[]).map((b) => [b.id, b]));
  let sent = 0;
  // A few at a time: n8n answers at once, but a slow or missing n8n must not stall the run.
  for (let i = 0; i < posts.length; i += 5) {
    const results = await Promise.all(
      posts.slice(i, i + 5).map((post) => {
        const b = businesses.get(post.business_id);
        return b ? designItem(db, post, b) : false;
      }),
    );
    sent += results.filter(Boolean).length;
  }
  return { claimed: claimed?.length ?? 0, sent };
}

export async function runCycle() {
  const db = postDb();
  const [planning, designs, whatsapp] = await Promise.all([
    runPlanning(db),
    dispatchDesigns(db),
    sendOwnerMessages(db).catch((e) => {
      console.error("[playlist] WhatsApp messages", e);
      return { sent: 0, configured: true, error: true };
    }),
  ]);
  return { planning, designs, whatsapp };
}
