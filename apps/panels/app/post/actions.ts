"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { PLAN_LIMITS } from "@/lib/post/plans";
import { postDb } from "@/lib/post/post-db";
import type { Brand, Json, PostFormat, Settings, Variants } from "@/lib/post/post-db.types";
import { SENSITIVE } from "@/lib/post/options";
import { BUSINESS_COOKIE, DEFAULT_SETTINGS, getCustomer, listBusinesses, requireBusiness } from "@/lib/post/session";
import { LOCK_MINUTES, localDate, zonedToUtc } from "@/lib/time";

const uuid = z.uuid();
const done = (message: string, paths: string[] = ["/"]): ActionResult => {
  for (const p of paths) revalidatePath(p, "layout");
  return { ok: true, message };
};
/** Posts whose slot is further away than the lock point. */
const lockIso = () => new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
const editedStatus = () => (process.env.POST_SAFETY_WORKFLOW === "on" ? "safety_review" : "approved");

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

const basics = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(120),
  category: z.string().trim().max(80),
  country: z.string().trim().length(2),
  timezone: z.string().trim().min(3).max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  languages: z.array(z.enum(["en", "si", "ta"])).min(1, "Pick at least one language"),
});

export async function createBusiness(input: z.input<typeof basics>): Promise<ActionResult> {
  return run(async () => {
    const customer = await getCustomer();
    if (!customer?.order) return { ok: false, message: "Retexia Post is not active on your account." };
    const d = basics.parse(input);
    const existing = await listBusinesses(customer.id);
    if (existing.length) return { ok: true, message: "Welcome back" };
    const { data, error } = await postDb()
      .from("businesses")
      .insert({
        owner_id: customer.id,
        ...d,
        category: d.category || null,
        // Sensitive industries always need the owner's approval (product spec).
        settings: { ...DEFAULT_SETTINGS, auto_publish: !SENSITIVE.includes(d.category) } as unknown as Json,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, message: dbMessage(error) };
    (await cookies()).set(BUSINESS_COOKIE, data.id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
    return done("Business created");
  });
}

export async function selectBusiness(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const ctx = await requireBusiness();
    const id = uuid.parse(input.id);
    if (!ctx.businesses.some((b) => b.id === id)) return { ok: false, message: "Business not found." };
    (await cookies()).set(BUSINESS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
    return done("Switched business");
  });
}

export async function updateBasics(input: z.input<typeof basics>): Promise<ActionResult> {
  return run(async () => {
    const { db, business, settings } = await requireBusiness();
    const d = basics.parse(input);
    const next = SENSITIVE.includes(d.category) ? { ...settings, auto_publish: false } : settings;
    const { error } = await db.from("businesses").update({ ...d, category: d.category || null, settings: next as unknown as Json }).eq("id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Business details saved");
  });
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const settingsInput = z.object({
  auto_publish: z.boolean(),
  week_plan_enabled: z.boolean(),
  slots: z.tuple([time, time, time]).refine((s) => s[0] < s[1] && s[1] < s[2], "Put the times in order, earliest first"),
  content_mix: z.object({ photo: z.number().int().min(0).max(3), reel: z.number().int().min(0).max(3) }).refine((m) => m.photo + m.reel === 3, "The mix must add up to 3 posts a day"),
  stories_per_day: z.number().int().min(0).max(3),
  paused: z.boolean(),
  whatsapp: z.object({
    enabled: z.boolean(),
    number: z.string().trim().max(20).regex(/^(\+?\d{8,15})?$/, "Use international format, e.g. +94771234567").nullable(),
    types: z.array(z.enum(["morning", "evening", "alerts"])),
    quiet_hours: z.tuple([time, time]),
  }),
});

export async function saveSettings(input: z.input<typeof settingsInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, business, settings } = await requireBusiness();
    const d = settingsInput.parse(input);
    if (d.week_plan_enabled && !PLAN_LIMITS[business.plan].weekPlan) return { ok: false, message: `The week plan is not part of the ${PLAN_LIMITS[business.plan].label} plan.` };
    if (d.whatsapp.enabled && !d.whatsapp.number) return { ok: false, message: "Add a WhatsApp number to turn on messages.", fieldErrors: { "whatsapp.number": "Required" } };
    const next: Settings = {
      ...settings,
      ...d,
      auto_publish: d.auto_publish && !SENSITIVE.includes(business.category ?? ""),
      whatsapp: {
        ...settings.whatsapp,
        ...d.whatsapp,
        number: d.whatsapp.number || null,
        opted_in_at: d.whatsapp.enabled ? (settings.whatsapp.enabled ? settings.whatsapp.opted_in_at : new Date().toISOString()) : null,
      },
    };
    const { error } = await db.from("businesses").update({ settings: next as unknown as Json }).eq("id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(d.paused ? "Saved. Publishing is paused." : "Settings saved");
  });
}

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const words = z.array(z.string().trim().min(1).max(40)).max(30);
const brandInput = z.object({
  colors: z.array(hex).max(5),
  font: z.string().trim().max(60),
  template: z.string().trim().max(40),
  tone: z.object({ formal_casual: z.number().min(0).max(100), calm_energetic: z.number().min(0).max(100) }),
  emoji: z.boolean(),
  always_words: words,
  never_words: words,
  sample_posts: z.array(z.string().trim().min(1).max(2200)).max(5),
  contact: z.object({ phone: z.string().trim().max(40), website: z.string().trim().max(200), address: z.string().trim().max(200), instagram: z.string().trim().max(60) }),
  brand_brief: z.string().trim().max(3000),
});

export async function saveBrand(input: z.input<typeof brandInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const d = brandInput.parse(input);
    const current = (business.brand ?? {}) as Brand;
    const contact = Object.fromEntries(Object.entries(d.contact).filter(([, v]) => v));
    const brand: Brand = {
      ...current,
      colors: d.colors,
      font: d.font || null,
      template: d.template || null,
      tone: d.tone,
      emoji: d.emoji,
      always_words: d.always_words,
      never_words: d.never_words,
      sample_posts: d.sample_posts,
      contact,
    };
    const ready = Boolean(d.brand_brief || d.sample_posts.length || d.colors.length);
    const { error } = await db
      .from("businesses")
      .update({ brand: brand as unknown as Json, brand_brief: d.brand_brief || null, onboarding_done: business.onboarding_done || ready })
      .eq("id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Brand saved. New posts use it from tonight.");
  });
}

// ---------------------------------------------------------------------------
// Uploads (photos are resized to max 2048 px JPEG + 400 px WebP thumbnail in the browser)
// ---------------------------------------------------------------------------

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function storeImage(form: FormData, businessId: string, folder: string) {
  const file = form.get("file");
  const thumb = form.get("thumb");
  if (!(file instanceof File)) throw new Error("Choose a photo.");
  if (!PHOTO_TYPES.includes(file.type)) throw new Error("Use a JPG, PNG or WebP photo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Photos must be under 10 MB after resizing.");
  const db = postDb();
  const id = crypto.randomUUID();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${businessId}/${folder}/${id}.${ext}`;
  const up = await db.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(up.error.message);
  let thumbPath: string | null = null;
  if (thumb instanceof File && thumb.type === "image/webp" && thumb.size <= 1024 * 1024) {
    thumbPath = `${businessId}/${folder}/${id}.webp`;
    const t = await db.storage.from("thumbs").upload(thumbPath, thumb, { contentType: "image/webp", upsert: false });
    if (t.error) thumbPath = null;
  }
  return { path, thumbPath, bytes: file.size };
}

export async function uploadMedia(form: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const productId = form.get("product_id") ? uuid.parse(String(form.get("product_id"))) : null;
    if (productId) {
      const { data: p } = await db.from("products").select("id").eq("id", productId).eq("business_id", business.id).maybeSingle();
      if (!p) return { ok: false, message: "Product not found." };
    }
    const description = z.string().trim().max(300).parse(String(form.get("description") ?? ""));
    const width = Number(form.get("width")) || null;
    const height = Number(form.get("height")) || null;
    const stored = await storeImage(form, business.id, "uploads");
    const { data, error } = await db
      .from("media")
      .insert({ business_id: business.id, product_id: productId, kind: "photo", source: "upload", storage_path: stored.path, thumb_path: stored.thumbPath, bytes: stored.bytes, width, height, description: description || null })
      .select("id")
      .single();
    if (error || !data) return { ok: false, message: dbMessage(error) };
    revalidatePath("/library");
    return { ok: true, message: "Photo added", data: { id: data.id } };
  });
}

export async function updateMedia(input: { id: string; product_id: string | null; description: string; tags: string[] }): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const d = z.object({ id: uuid, product_id: uuid.nullable(), description: z.string().trim().max(300), tags: z.array(z.string().trim().min(1).max(30)).max(15) }).parse(input);
    if (d.product_id) {
      const { data: p } = await db.from("products").select("id").eq("id", d.product_id).eq("business_id", business.id).maybeSingle();
      if (!p) return { ok: false, message: "Product not found." };
    }
    const { error } = await db.from("media").update({ product_id: d.product_id, description: d.description || null, tags: d.tags }).eq("id", d.id).eq("business_id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Saved", ["/library"]);
  });
}

export async function deleteMedia(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const id = uuid.parse(input.id);
    const { data: m } = await db.from("media").select("storage_path, thumb_path").eq("id", id).eq("business_id", business.id).maybeSingle();
    if (!m) return { ok: false, message: "Photo not found." };
    const { count } = await db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("media_id", id)
      .in("status", ["generating", "safety_review", "ready", "approved", "publishing", "needs_manual"]);
    if (count) return { ok: false, message: "An upcoming post uses this photo. Change that post's photo first." };
    await db.storage.from("media").remove([m.storage_path]);
    if (m.thumb_path) await db.storage.from("thumbs").remove([m.thumb_path]);
    const { error } = await db.from("media").delete().eq("id", id).eq("business_id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Photo deleted", ["/library"]);
  });
}

export async function uploadLogo(form: FormData): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const stored = await storeImage(form, business.id, "brand");
    const brand = { ...((business.brand ?? {}) as Brand), logo_path: stored.path };
    const { error } = await db.from("businesses").update({ brand: brand as unknown as Json }).eq("id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Logo saved. It is placed on new designs.", ["/brand"]);
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const productInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Enter a name").max(120),
  price: z.number().min(0).max(100_000_000).nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  description: z.string().trim().max(1000),
  active: z.boolean(),
});

export async function saveProduct(input: z.input<typeof productInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const { id, ...d } = productInput.parse(input);
    const row = { ...d, description: d.description || null };
    const { error } = id
      ? await db.from("products").update(row).eq("id", id).eq("business_id", business.id)
      : await db.from("products").insert({ ...row, business_id: business.id });
    if (error) return { ok: false, message: dbMessage(error) };
    return done(id ? "Product saved" : "Product added", ["/products"]);
  });
}

export async function deleteProduct(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const { error } = await db.from("products").delete().eq("id", uuid.parse(input.id)).eq("business_id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Product deleted", ["/products"]);
  });
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

async function ownPost(id: string) {
  const ctx = await requireBusiness();
  const { data: post } = await ctx.db.from("posts").select("*").eq("id", uuid.parse(id)).eq("business_id", ctx.business.id).maybeSingle();
  return { ...ctx, post };
}

export async function approvePost(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, post, customer } = await ownPost(input.id);
    if (!post) return { ok: false, message: "Post not found." };
    if (post.status !== "ready") return { ok: false, message: "Only posts that are ready can be approved." };
    const { data, error } = await db
      .from("posts")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: customer.id })
      .eq("id", post.id)
      .eq("status", "ready")
      .gt("scheduled_at", lockIso())
      .select("id");
    if (error) return { ok: false, message: dbMessage(error) };
    if (!data?.length) return { ok: false, message: "This post is locked for publishing." };
    return done("Approved. It goes out at its time.");
  });
}

export async function approveDay(input: { date: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, business, customer } = await requireBusiness();
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input.date);
    const { data, error } = await db
      .from("posts")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: customer.id })
      .eq("business_id", business.id)
      .eq("local_date", date)
      .eq("status", "ready")
      .gt("scheduled_at", lockIso())
      .select("id");
    if (error) return { ok: false, message: dbMessage(error) };
    return done(data?.length ? `${data.length} post${data.length === 1 ? "" : "s"} approved` : "Nothing left to approve");
  });
}

export async function denyPost(input: { id: string; reason: "caption" | "image" | "both" | "wrong_product" }): Promise<ActionResult> {
  return run(async () => {
    const { db, post } = await ownPost(input.id);
    const reason = z.enum(["caption", "image", "both", "wrong_product"]).parse(input.reason);
    if (!post) return { ok: false, message: "Post not found." };
    if (!["ready", "approved"].includes(post.status)) return { ok: false, message: "This post can't be sent back right now." };
    const out = post.regen_count >= 10;
    const { data, error } = await db
      .from("posts")
      .update(out ? { status: "needs_manual" } : { status: "denied", regen_count: post.regen_count + 1, deny_reason: reason, approved_at: null, approved_by: null })
      .eq("id", post.id)
      .eq("regen_count", post.regen_count)
      .in("status", ["ready", "approved"])
      .gt("scheduled_at", lockIso())
      .select("id");
    if (error) return { ok: false, message: dbMessage(error) };
    if (!data?.length) return { ok: false, message: "This post is locked for publishing." };
    return done(out ? "No new versions left for this post. Edit it, pick your own photo, or skip it." : `Making a new version (${9 - post.regen_count} left after this one).`);
  });
}

const editInput = z.object({
  id: uuid,
  facebook: z.string().trim().max(5000),
  instagram: z.string().trim().max(2200),
  hashtags: z.array(z.string().trim().regex(/^[\p{L}\p{N}_]+$/u, "Letters, numbers and _ only").max(60)).max(30),
  media_id: uuid.nullable(),
});

export async function editPost(input: z.input<typeof editInput>): Promise<ActionResult> {
  return run(async () => {
    const d = editInput.parse(input);
    const { db, post, business, customer } = await ownPost(d.id);
    if (!post) return { ok: false, message: "Post not found." };
    if (!["ready", "approved", "needs_manual", "denied", "blocked"].includes(post.status)) return { ok: false, message: "This post can't be edited now." };
    if (d.media_id && d.media_id !== post.media_id) {
      const { data: m } = await db.from("media").select("id").eq("id", d.media_id).eq("business_id", business.id).maybeSingle();
      if (!m) return { ok: false, message: "Photo not found." };
    }
    const tags = d.hashtags.map((t) => `#${t.replace(/^#+/, "")}`);
    const variants: Variants = {
      ...((post.variants ?? {}) as Variants),
      facebook: { caption: d.facebook },
      instagram: { caption: d.instagram + (tags.length ? `\n\n${tags.join(" ")}` : ""), hashtags: tags },
    };
    const { data, error } = await db
      .from("posts")
      .update({ caption: d.instagram, variants: variants as unknown as Json, media_id: d.media_id, status: editedStatus(), approved_at: new Date().toISOString(), approved_by: customer.id })
      .eq("id", post.id)
      .gt("scheduled_at", lockIso())
      .select("id");
    if (error) return { ok: false, message: dbMessage(error) };
    if (!data?.length) return { ok: false, message: "This post is locked for publishing." };
    if (d.media_id && d.media_id !== post.media_id) await db.from("media").update({ last_used_at: new Date().toISOString() }).eq("id", d.media_id).eq("business_id", business.id);
    return done("Saved and approved");
  });
}

export async function movePost(input: { id: string; date: string; slot: number }): Promise<ActionResult> {
  return run(async () => {
    const d = z.object({ id: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slot: z.number().int().min(1).max(3) }).parse(input);
    const { db, post, business, settings } = await ownPost(d.id);
    if (!post) return { ok: false, message: "Post not found." };
    if (["published", "publishing"].includes(post.status)) return { ok: false, message: "This post is already out." };
    const scheduled = zonedToUtc(d.date, settings.slots[d.slot - 1]!, business.timezone);
    if (new Date(scheduled).getTime() <= Date.now() + LOCK_MINUTES * 60000) return { ok: false, message: "Pick a time at least 15 minutes from now." };
    const { data: taken } = await db
      .from("posts")
      .select("id")
      .eq("business_id", business.id)
      .eq("local_date", d.date)
      .eq("slot", d.slot)
      .eq("is_story", post.is_story)
      .neq("id", post.id)
      .maybeSingle();
    if (taken) return { ok: false, message: "That time already has a post. Move or skip that one first." };
    const status = post.status === "expired" ? "ready" : post.status;
    const { error } = await db.from("posts").update({ local_date: d.date, slot: d.slot, scheduled_at: scheduled, status }).eq("id", post.id).eq("business_id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Moved");
  });
}

export async function skipPost(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, post } = await ownPost(input.id);
    if (!post) return { ok: false, message: "Post not found." };
    if (["published", "publishing"].includes(post.status)) return { ok: false, message: "This post is already out." };
    const { error } = await db.from("posts").update({ status: "expired" }).eq("id", post.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Skipped. Nothing goes out in that slot.");
  });
}

/** A failed post goes back to the publish queue (accounts that already worked are not posted again). */
export async function retryPost(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, post, business } = await ownPost(input.id);
    if (!post) return { ok: false, message: "Post not found." };
    if (post.status !== "failed") return { ok: false, message: "Only failed posts can be retried." };
    await db.from("publications").delete().eq("post_id", post.id).eq("status", "failed");
    const { error } = await db.from("posts").update({ status: "approved", scheduled_at: new Date().toISOString() }).eq("id", post.id).eq("business_id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    await db.from("events").insert({ business_id: business.id, type: "retry_requested", payload: { post_id: post.id } });
    return done("Queued again. It goes out within a minute or two.");
  });
}

/** New photo post through the n8n "Photo post (generate + publish)" workflow. */
export async function createPost(input: { prompt: string; publish: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { db, business, settings } = await requireBusiness();
    const d = z.object({ prompt: z.string().trim().min(10, "Tell us a bit more (at least 10 characters)").max(1500), publish: z.boolean() }).parse(input);
    const url = process.env.N8N_PHOTO_POST_URL;
    if (!url) return { ok: false, message: "Post creation is not connected yet. Please message Retexia." };
    if (d.publish && settings.paused) return { ok: false, message: "Publishing is paused (Settings). Save it as a draft, or turn publishing back on." };
    const period = `${localDate(business.timezone).slice(0, 7)}-01`;
    const { data: usage } = await db.from("usage_monthly").select("images").eq("business_id", business.id).eq("period", period).maybeSingle();
    const limit = PLAN_LIMITS[business.plan].images;
    if ((usage?.images ?? 0) >= limit) return { ok: false, message: `You've used all ${limit} AI designs this month. Use a library photo instead, or upgrade.` };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.N8N_POST_KEY ? { "x-retexia-key": process.env.N8N_POST_KEY } : {}) },
      body: JSON.stringify({ prompt: d.prompt, publish: d.publish, business_id: business.id }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    }).catch(() => null);
    if (!res?.ok) return { ok: false, message: "We couldn't start the design right now. Please try again in a minute." };
    await db.from("events").insert({ business_id: business.id, type: "post_requested", payload: { prompt: d.prompt, publish: d.publish } });
    return done(d.publish ? "Designing your post. It is published in about 2 minutes." : "Designing your post. It appears as a draft in about 2 minutes.");
  });
}

// ---------------------------------------------------------------------------
// Week plan and offers
// ---------------------------------------------------------------------------

const formats = z.enum(["photo", "carousel", "reel", "story_photo", "story_video"]);

export async function saveWeekNote(input: { id?: string; date: string; slot: number; note: string; format: PostFormat | null; media_id: string | null }): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    if (!PLAN_LIMITS[business.plan].weekPlan) return { ok: false, message: "The week plan is not part of your plan." };
    const d = z.object({ id: uuid.optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slot: z.number().int().min(1).max(3), note: z.string().trim().max(500), format: formats.nullable(), media_id: uuid.nullable() }).parse(input);
    if (d.media_id) {
      const { data: m } = await db.from("media").select("id").eq("id", d.media_id).eq("business_id", business.id).maybeSingle();
      if (!m) return { ok: false, message: "Photo not found." };
    }
    if (!d.note && !d.media_id) {
      if (d.id) await db.from("plan_items").delete().eq("id", d.id).eq("business_id", business.id);
      return done("Cleared", ["/plan"]);
    }
    const row = { business_id: business.id, type: "week_note" as const, start_date: d.date, end_date: d.date, slot: d.slot, note: d.note || null, format: d.format, media_id: d.media_id };
    const { error } = d.id ? await db.from("plan_items").update(row).eq("id", d.id).eq("business_id", business.id) : await db.from("plan_items").insert(row);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Saved for that slot", ["/plan"]);
  });
}

const offerInput = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(2, "Give the offer a title").max(120),
  details: z.string().trim().max(1000),
  price: z.string().trim().max(60),
  discount: z.string().trim().max(60),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slots_per_day: z.number().int().min(1).max(3),
  media_id: uuid.nullable(),
  active: z.boolean(),
});

export async function saveOffer(input: z.input<typeof offerInput>): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const { id, ...d } = offerInput.parse(input);
    if (d.end_date < d.start_date) return { ok: false, message: "The end date is before the start date.", fieldErrors: { end_date: "Before start" } };
    if (d.media_id) {
      const { data: m } = await db.from("media").select("id").eq("id", d.media_id).eq("business_id", business.id).maybeSingle();
      if (!m) return { ok: false, message: "Photo not found." };
    }
    const ends = new Date(`${d.end_date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    const row = {
      business_id: business.id,
      type: "offer" as const,
      start_date: d.start_date,
      end_date: d.end_date,
      slots_per_day: d.slots_per_day,
      note: d.details || null,
      media_id: d.media_id,
      active: d.active,
      details: { title: d.title, price: d.price || null, discount: d.discount || null, ends_text: `ends ${ends}` },
    };
    const { error } = id ? await db.from("plan_items").update(row).eq("id", id).eq("business_id", business.id) : await db.from("plan_items").insert(row);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(id ? "Offer saved" : "Offer added. It is used from tonight.", ["/plan"]);
  });
}

export async function deletePlanItem(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const { error } = await db.from("plan_items").delete().eq("id", uuid.parse(input.id)).eq("business_id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Deleted", ["/plan"]);
  });
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function setAccountEnabled(input: { id: string; enabled: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const d = z.object({ id: uuid, enabled: z.boolean() }).parse(input);
    const { error } = await db.from("social_accounts").update({ enabled: d.enabled }).eq("id", d.id).eq("business_id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(d.enabled ? "Posting to this account again" : "Paused for this account", ["/accounts"]);
  });
}

export async function setWeekPlan(input: { enabled: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { db, business, settings } = await requireBusiness();
    const enabled = z.boolean().parse(input.enabled);
    if (enabled && !PLAN_LIMITS[business.plan].weekPlan) return { ok: false, message: `The week plan is not part of the ${PLAN_LIMITS[business.plan].label} plan.` };
    const { error } = await db.from("businesses").update({ settings: { ...settings, week_plan_enabled: enabled } as unknown as Json }).eq("id", business.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(enabled ? "Week plan on: tonight's posts follow your notes." : "Week plan off. Your notes are kept.", ["/plan"]);
  });
}
