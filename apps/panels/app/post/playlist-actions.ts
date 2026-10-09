"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { CAPTION_LANGUAGES, DESIGN_LANGUAGES } from "@/lib/post/languages";
import { deletePublished, instagramDeleteEnabled, noPermission, updateFacebookText } from "@/lib/post/meta";
import { designConfigured, requestDesign } from "@/lib/post/n8n";
import { SENSITIVE } from "@/lib/post/options";
import { PLAN_LIMITS, defaultTimes } from "@/lib/post/plans";
import { PLAYLIST_SLOTS, designItem } from "@/lib/post/playlist";
import type { Json, PostRow, PostStatus, Settings, Variants } from "@/lib/post/post-db.types";
import { fitTimes, requireBusiness } from "@/lib/post/session";
import { LOCK_MINUTES, addDays, localDate, zonedToUtc } from "@/lib/time";

const uuid = z.uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const captionLang = z.enum(CAPTION_LANGUAGES.map((l) => l.value) as [string, ...string[]]);
const designLang = z.enum(DESIGN_LANGUAGES.map((l) => l.value) as [string, ...string[]]);
const prompt = z.string().trim().min(5, "Describe the post in a few words (at least 5 letters)").max(1500);

const done = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};
const lockedAt = (iso: string) => new Date(iso).getTime() - LOCK_MINUTES * 60_000 <= Date.now();
const monthStart = (tz: string) => `${localDate(tz).slice(0, 7)}-01`;

/** Statuses of items that have not been designed yet (their prompt can still change). */
const UNDESIGNED: PostStatus[] = ["planned", "needs_manual"];
/** Not published yet, so it can be deleted outright. */
const UNPUBLISHED: PostStatus[] = ["planned", "generating", "ready", "approved", "needs_manual", "denied", "blocked", "expired", "failed", "safety_review"];

async function ownPost(id: string) {
  const ctx = await requireBusiness();
  const { data: post } = await ctx.db.from("posts").select("*").eq("id", uuid.parse(id)).eq("business_id", ctx.business.id).maybeSingle();
  return { ...ctx, post: post as PostRow | null };
}

// ---------------------------------------------------------------------------
// Playlist items
// ---------------------------------------------------------------------------

const itemInput = z.object({
  id: uuid,
  title: z.string().trim().max(120),
  prompt,
  caption_language: captionLang,
  design_language: designLang,
  time,
});

/** Change a planned item: its prompt, languages and time. */
export async function savePlaylistItem(input: z.input<typeof itemInput>): Promise<ActionResult> {
  return run(async () => {
    const d = itemInput.parse(input);
    const { db, post, business } = await ownPost(d.id);
    if (!post) return { ok: false, message: "Item not found." };
    if (!UNDESIGNED.includes(post.status)) return { ok: false, message: "This item is already designed. Use Redo to change it." };
    const at = zonedToUtc(post.local_date, d.time, business.timezone);
    if (new Date(at).getTime() < Date.now() + 20 * 60_000) return { ok: false, message: "Pick a time at least 20 minutes from now.", fieldErrors: { time: "Too soon" } };
    const brief = { ...((post.brief ?? {}) as Record<string, unknown>), title: d.title || null, prompt: d.prompt, caption_language: d.caption_language, design_language: d.design_language };
    const { error } = await db
      .from("posts")
      .update({ brief: brief as Json, scheduled_at: at, status: "planned", deny_reason: null })
      .eq("id", post.id)
      .in("status", UNDESIGNED);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Saved. It is designed before its time.");
  });
}

const addInput = z.object({ date: dateStr, format: z.enum(["post", "story"]), prompt, time: time.optional(), caption_language: captionLang.optional(), design_language: designLang.optional() });

/** Add an item to a day's playlist (up to the plan's posts / stories a day). */
export async function addPlaylistItem(input: z.input<typeof addInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, business, settings } = await requireBusiness();
    const d = addInput.parse(input);
    const today = localDate(business.timezone);
    if (d.date < today || d.date > addDays(today, 7)) return { ok: false, message: "Pick today or a day in the next week." };
    const story = d.format === "story";
    const max = story ? PLAN_LIMITS[business.plan].storiesPerDay : PLAN_LIMITS[business.plan].postsPerDay;
    const { data: existing } = await db.from("posts").select("slot").eq("business_id", business.id).eq("local_date", d.date).eq("is_story", story).lte("slot", PLAYLIST_SLOTS);
    const used = new Set((existing ?? []).map((e) => e.slot));
    if (used.size >= max) return { ok: false, message: `Your plan allows ${max} ${story ? "stories" : "posts"} a day. Delete one first, or upgrade.` };
    const slot = Array.from({ length: max }, (_, i) => i + 1).find((n) => !used.has(n))!;
    const times = story ? settings.playlist.story_times : settings.playlist.post_times;
    const at = d.time ?? times[slot - 1] ?? defaultTimes(max, story)[slot - 1]!;
    if (new Date(zonedToUtc(d.date, at, business.timezone)).getTime() < Date.now() + 20 * 60_000) {
      return { ok: false, message: "That time has passed. Pick a time at least 20 minutes from now.", fieldErrors: { time: "Too soon" } };
    }
    const { data: n, error } = await db.rpc("add_planned_items", {
      p_business: business.id,
      p_date: d.date,
      p_items: [
        {
          format: d.format,
          slot,
          time: at,
          prompt: d.prompt,
          title: d.prompt.slice(0, 60),
          source: "manual",
          caption_language: d.caption_language ?? settings.caption_language,
          design_language: d.design_language ?? settings.design_language,
        },
      ] as unknown as Json,
    });
    if (error) return { ok: false, message: dbMessage(error) };
    if (!n) return { ok: false, message: "That slot was just taken. Try again." };
    return done(`Added to the playlist at ${at}.`);
  });
}

/** Design a planned item now (instead of waiting for midnight). */
export async function designNow(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, post, business } = await ownPost(input.id);
    if (!post) return { ok: false, message: "Item not found." };
    if (!UNDESIGNED.includes(post.status)) return { ok: false, message: "This item is already designed or being designed." };
    if (lockedAt(post.scheduled_at)) return { ok: false, message: "It is too close to its time. Move it later first." };
    if (!designConfigured()) return { ok: false, message: "Designing is not connected yet. Please message Retexia." };
    const brief = { ...((post.brief ?? {}) as Record<string, unknown>), design_attempts: 1, design_started_at: new Date().toISOString() };
    const { data, error } = await db.from("posts").update({ status: "generating", brief: brief as Json, deny_reason: null }).eq("id", post.id).in("status", UNDESIGNED).select("*");
    if (error || !data?.length) return { ok: false, message: error ? dbMessage(error) : "It is already being designed." };
    const ok = await designItem(db, data[0] as PostRow, business);
    return ok ? done("Designing it now. It appears here in about a minute.") : { ok: false, message: "The designer didn't answer. It is tried again automatically." };
  });
}

const redoInput = z.object({ id: uuid, prompt: prompt.optional(), caption_language: captionLang.optional(), design_language: designLang.optional(), change: z.enum(["caption", "image", "both", "wrong_product"]) });

/** Make a new version of a designed item (counts toward 10 per post and the month's redos). */
export async function redoDesign(input: z.input<typeof redoInput>): Promise<ActionResult> {
  return run(async () => {
    const d = redoInput.parse(input);
    const { db, post, business } = await ownPost(d.id);
    if (!post) return { ok: false, message: "Item not found." };
    if (!["ready", "approved", "needs_manual", "failed", "expired", "blocked"].includes(post.status)) return { ok: false, message: "This item can't be redone right now." };
    if (lockedAt(post.scheduled_at) && post.status !== "expired" && post.status !== "failed") return { ok: false, message: "It is too close to its time. Move it later first." };
    const { count: published } = await db.from("publications").select("id", { count: "exact", head: true }).eq("post_id", post.id).eq("status", "published");
    if (published) return { ok: false, message: "It is already published. Delete it, then add a new one." };
    if (post.regen_count >= 10) return { ok: false, message: "No new versions left for this post. Edit the caption or pick your own photo." };
    const { data: usage } = await db.from("usage_monthly").select("regenerations").eq("business_id", business.id).eq("period", monthStart(business.timezone)).maybeSingle();
    if ((usage?.regenerations ?? 0) >= PLAN_LIMITS[business.plan].regenerations) return { ok: false, message: "You've used this month's redos. Edit the caption or pick your own photo." };
    if (!designConfigured()) return { ok: false, message: "Designing is not connected yet. Please message Retexia." };

    const brief = { ...((post.brief ?? {}) as Record<string, unknown>) } as Record<string, unknown> & { prompt?: string };
    if (d.prompt) brief.prompt = d.prompt;
    if (d.caption_language) brief.caption_language = d.caption_language;
    if (d.design_language) brief.design_language = d.design_language;
    const feedback = { caption: "Write a different caption; keep the picture idea.", image: "Make a different picture.", both: "Make a different picture and caption.", wrong_product: "It showed the wrong product; follow the request exactly." }[d.change];
    // A redo of a skipped or failed item moves to the next free time today, at least 30 minutes away.
    const at = ["expired", "failed"].includes(post.status) && new Date(post.scheduled_at).getTime() < Date.now() + 30 * 60_000 ? new Date(Date.now() + 45 * 60_000).toISOString() : post.scheduled_at;
    const { data, error } = await db
      .from("posts")
      .update({ status: "generating", brief: { ...brief, design_attempts: 1, design_started_at: new Date().toISOString() } as Json, regen_count: post.regen_count + 1, deny_reason: d.change, scheduled_at: at, approved_at: null, approved_by: null })
      .eq("id", post.id)
      .eq("regen_count", post.regen_count)
      .select("*");
    if (error || !data?.length) return { ok: false, message: error ? dbMessage(error) : "Someone else just changed it. Try again." };
    const r = await requestDesign({
      business_id: business.id,
      post_id: post.id,
      prompt: `${String(brief.prompt ?? post.caption ?? "A post for the business")}\n\nThe owner asked for a new version: ${feedback}`.slice(0, 1600),
      format: post.is_story ? "story" : "post",
      caption_language: (brief.caption_language as never) ?? "si",
      design_language: (brief.design_language as never) ?? "si",
      publish: false,
    });
    if (!r.ok) {
      await db.rpc("design_failed", { p_post: post.id, p_error: "The designer didn't answer. Press Redo again in a minute." });
      return { ok: false, message: "The designer didn't answer. Try again in a minute." };
    }
    await db.rpc("bump_usage", { p_business: business.id, p_field: "regenerations", p_amount: 1, p_cost: 0 });
    return done(`Making a new version (${9 - post.regen_count} left after this one).`);
  });
}

/** Move an item to another time of its day. */
export async function setItemTime(input: { id: string; time: string }): Promise<ActionResult> {
  return run(async () => {
    const d = z.object({ id: uuid, time }).parse(input);
    const { db, post, business } = await ownPost(d.id);
    if (!post) return { ok: false, message: "Item not found." };
    if (!["planned", "ready", "approved", "needs_manual"].includes(post.status)) return { ok: false, message: "This item can't be moved now." };
    if (lockedAt(post.scheduled_at)) return { ok: false, message: "It is locked for publishing." };
    const at = zonedToUtc(post.local_date, d.time, business.timezone);
    if (new Date(at).getTime() < Date.now() + 20 * 60_000) return { ok: false, message: "Pick a time at least 20 minutes from now." };
    const { error } = await db.from("posts").update({ scheduled_at: at }).eq("id", post.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(`Moved to ${d.time}`);
  });
}

// ---------------------------------------------------------------------------
// Published posts: edit the Facebook text, delete from Facebook and Instagram
// ---------------------------------------------------------------------------

async function tokenFor(db: Awaited<ReturnType<typeof requireBusiness>>["db"], secretId: string | null) {
  if (!secretId) return null;
  const { data } = await db.rpc("read_secret", { p_secret: secretId });
  return data ?? null;
}

/**
 * Delete an item. Not published yet: it leaves the playlist. Published: it is
 * deleted from Facebook and Instagram too (each account separately).
 */
export async function deletePost(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, post, business } = await ownPost(input.id);
    if (!post) return { ok: false, message: "Item not found." };
    if (post.status === "publishing") return { ok: false, message: "It is being published right now. Try again in a minute." };
    const { data: pubs } = await db.from("publications").select("id, status, external_id, social_account_id").eq("post_id", post.id);
    const live = (pubs ?? []).filter((p) => p.status === "published" && p.external_id);
    if (!live.length) {
      if (!UNPUBLISHED.includes(post.status) && post.status !== "published" && post.status !== "removed") return { ok: false, message: "This item can't be deleted now." };
      const { error } = await db.from("posts").delete().eq("id", post.id);
      if (error) return { ok: false, message: dbMessage(error) };
      await db.from("events").insert({ business_id: business.id, type: "item_deleted", payload: { date: post.local_date, slot: post.slot, story: post.is_story } });
      return done("Deleted from the playlist.");
    }
    const { data: accounts } = await db.from("social_accounts").select("id, platform, display_name, token_secret_id").eq("business_id", business.id);
    const failed: string[] = [];
    const deleted = new Set<string>();
    // Instagram posts Retexia may not delete (permission not granted yet): the owner deletes them in the app.
    let instagramByHand = false;
    const byHand = async (id: string) => {
      instagramByHand = true;
      await db.from("publications").update({ status: "removed", last_error: "Still on Instagram: delete it in the Instagram app." }).eq("id", id);
    };
    for (const p of live) {
      const a = (accounts ?? []).find((x) => x.id === p.social_account_id);
      const name = a ? (a.platform === "facebook" ? "Facebook" : "Instagram") : "an account";
      if (a?.platform === "instagram" && !instagramDeleteEnabled()) {
        await byHand(p.id);
        continue;
      }
      const token = await tokenFor(db, a?.token_secret_id ?? null);
      if (!token) {
        failed.push(`${name} (reconnect it first)`);
        continue;
      }
      const r = await deletePublished(p.external_id!, token);
      if (r.ok) {
        await db.from("publications").update({ status: "removed" }).eq("id", p.id);
        deleted.add(name);
      } else if (a?.platform === "instagram" && noPermission(r.error)) await byHand(p.id);
      else failed.push(`${name}: ${r.error.message}`);
    }
    const handNote = instagramByHand ? " Instagram doesn't let Retexia delete it yet: open the post in the Instagram app, tap ⋯ and Delete." : "";
    if (failed.length === live.length) return { ok: false, message: `Couldn't delete it: ${failed.join("; ")}` };
    if (!failed.length) await db.from("posts").update({ status: "removed" }).eq("id", post.id);
    await db.from("events").insert({ business_id: business.id, type: "post_deleted", payload: { post_id: post.id, failed, instagram_by_hand: instagramByHand } });
    revalidatePath("/", "layout");
    if (failed.length) return { ok: false, message: `Deleted in part. Still up: ${failed.join("; ")}.${handNote}` };
    const where = deleted.size ? `Deleted from ${[...deleted].join(" and ")}.` : "Removed from Retexia.";
    return { ok: true, message: `${where}${handNote}` };
  });
}

/** Change the text of a published Facebook post (Instagram doesn't allow apps to change captions). */
export async function editPublishedText(input: { id: string; facebook: string }): Promise<ActionResult> {
  return run(async () => {
    const d = z.object({ id: uuid, facebook: z.string().trim().min(1, "Write the text").max(5000) }).parse(input);
    const { db, post, business } = await ownPost(d.id);
    if (!post) return { ok: false, message: "Post not found." };
    if (post.is_story) return { ok: false, message: "Stories have no text to edit." };
    const { data: pubs } = await db.from("publications").select("id, status, external_id, social_account_id").eq("post_id", post.id).eq("status", "published");
    const { data: accounts } = await db.from("social_accounts").select("id, platform, token_secret_id").eq("business_id", business.id).eq("platform", "facebook");
    const fb = (pubs ?? []).filter((p) => (accounts ?? []).some((a) => a.id === p.social_account_id) && p.external_id);
    if (!fb.length) return { ok: false, message: "It isn't published on Facebook." };
    for (const p of fb) {
      const a = accounts!.find((x) => x.id === p.social_account_id)!;
      const token = await tokenFor(db, a.token_secret_id);
      if (!token) return { ok: false, message: "Reconnect Facebook first (Facebook and Instagram page)." };
      const r = await updateFacebookText(p.external_id!, d.facebook, token);
      if (!r.ok) return { ok: false, message: `Facebook: ${r.error.message}` };
    }
    const variants: Variants = { ...((post.variants ?? {}) as Variants), facebook: { caption: d.facebook } };
    await db.from("posts").update({ variants: variants as unknown as Json }).eq("id", post.id);
    return done("Facebook text updated. Instagram captions can't be changed by apps: delete and post again to change it there.");
  });
}

// ---------------------------------------------------------------------------
// Playlist settings and posts made by hand
// ---------------------------------------------------------------------------

const settingsInput = z.object({
  posts: z.number().int().min(0).max(PLAYLIST_SLOTS),
  stories: z.number().int().min(0).max(PLAYLIST_SLOTS),
  post_times: z.array(time).max(PLAYLIST_SLOTS),
  story_times: z.array(time).max(PLAYLIST_SLOTS),
  caption_language: captionLang,
  design_language: designLang,
  auto_publish: z.boolean(),
  paused: z.boolean(),
});

/**
 * How many posts and stories a day, their times, the languages, and
 * publishing. New times also move today's and tomorrow's remaining items.
 */
export async function savePlaylistSettings(input: z.input<typeof settingsInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, business, settings } = await requireBusiness();
    const d = settingsInput.parse(input);
    const limits = PLAN_LIMITS[business.plan];
    if (d.posts > limits.postsPerDay || d.stories > limits.storiesPerDay) {
      return { ok: false, message: `The ${limits.label} plan allows up to ${limits.postsPerDay} posts and ${limits.storiesPerDay} stories a day.` };
    }
    const postTimes = fitTimes(d.post_times, d.posts, false);
    const storyTimes = fitTimes(d.story_times, d.stories, true);
    if (new Set(postTimes).size !== postTimes.length || new Set(storyTimes).size !== storyTimes.length) {
      return { ok: false, message: "Two items have the same time. Give each one its own time." };
    }
    const next: Settings = {
      ...settings,
      playlist: { posts: d.posts, stories: d.stories, post_times: postTimes, story_times: storyTimes },
      caption_language: d.caption_language as Settings["caption_language"],
      design_language: d.design_language as Settings["design_language"],
      auto_publish: d.auto_publish && !SENSITIVE.includes(business.category ?? ""),
      paused: d.paused,
      stories_per_day: d.stories,
    };
    const { error } = await db.from("businesses").update({ settings: next as unknown as Json }).eq("id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };

    // Move today's and tomorrow's remaining playlist items to the new times.
    const today = localDate(business.timezone);
    const { data: items } = await db
      .from("posts")
      .select("id, local_date, slot, is_story, scheduled_at, status")
      .eq("business_id", business.id)
      .in("local_date", [today, addDays(today, 1)])
      .lte("slot", PLAYLIST_SLOTS)
      .in("status", ["planned", "ready", "approved", "needs_manual"]);
    let moved = 0;
    for (const it of items ?? []) {
      const t = (it.is_story ? storyTimes : postTimes)[it.slot - 1];
      if (!t || lockedAt(it.scheduled_at)) continue;
      const at = zonedToUtc(it.local_date, t, business.timezone);
      if (new Date(at).getTime() === new Date(it.scheduled_at).getTime() || new Date(at).getTime() < Date.now() + 20 * 60_000) continue;
      await db.from("posts").update({ scheduled_at: at }).eq("id", it.id);
      moved++;
    }
    return done(`Saved. ${moved ? `${moved} item${moved === 1 ? "" : "s"} moved to the new times. ` : ""}The number of posts and stories applies from the next playlist (written at 6 AM).`);
  });
}

const createInput = z.object({
  prompt,
  format: z.enum(["post", "story"]),
  caption_language: captionLang,
  design_language: designLang,
  when: z.enum(["now", "later"]),
  date: dateStr.optional(),
  time: time.optional(),
});

/** A post or story made by hand (outside the playlist): publish now, or at a time. */
export async function createPost(input: z.input<typeof createInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, business, settings } = await requireBusiness();
    const d = createInput.parse(input);
    if (!designConfigured()) return { ok: false, message: "Post creation is not connected yet. Please message Retexia." };
    if (d.when === "now") {
      if (settings.paused) return { ok: false, message: "Publishing is paused (Settings). Schedule it for later, or turn publishing back on." };
      const { data: sys } = await db.from("system_settings").select("publishing_paused").eq("id", 1).maybeSingle();
      if (sys?.publishing_paused) return { ok: false, message: "Publishing is paused by Retexia for a short while. Schedule it for later." };
    }
    let scheduled: string | undefined;
    if (d.when === "later") {
      if (!d.date || !d.time) return { ok: false, message: "Pick a day and time.", fieldErrors: { time: "Required" } };
      scheduled = zonedToUtc(d.date, d.time, business.timezone);
      if (new Date(scheduled).getTime() < Date.now() + 20 * 60_000) return { ok: false, message: "Pick a time at least 20 minutes from now.", fieldErrors: { time: "Too soon" } };
    }
    const { data: usage } = await db.from("usage_monthly").select("images").eq("business_id", business.id).eq("period", monthStart(business.timezone)).maybeSingle();
    const limit = PLAN_LIMITS[business.plan].images;
    if ((usage?.images ?? 0) >= limit) return { ok: false, message: `You've used all ${limit} AI designs this month. Use a library photo instead, or upgrade.` };
    const r = await requestDesign({
      business_id: business.id,
      prompt: d.prompt,
      format: d.format,
      caption_language: d.caption_language as never,
      design_language: d.design_language as never,
      publish: d.when === "now",
      scheduled_at: scheduled,
    });
    if (!r.ok) return { ok: false, message: "We couldn't start the design right now. Please try again in a minute." };
    await db.from("events").insert({ business_id: business.id, type: "post_requested", payload: { prompt: d.prompt, format: d.format, when: d.when } });
    return done(d.when === "now" ? `Designing your ${d.format}. It is published in about 2 minutes.` : `Designing your ${d.format}. It goes out on ${d.date} at ${d.time}.`);
  });
}
