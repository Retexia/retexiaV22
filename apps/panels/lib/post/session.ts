import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AccessError } from "../action";
import { getCustomer as getCustomerFor, requirePayingCustomer, type Customer, type PayingCustomer } from "../customer";
import { defaultLanguages, isCaptionLanguage, isDesignLanguage } from "./languages";
import { PLAN_LIMITS, defaultTimes } from "./plans";
import { postDb, type PostDb } from "./post-db";
import type { BusinessRow, Settings, WhatsAppType } from "./post-db.types";

export const BUSINESS_COOKIE = "rx_post_business";
const productSlug = () => process.env.POST_PRODUCT_SLUG || "post";

export type { Customer, PayingCustomer };
export const getCustomer = () => getCustomerFor(productSlug());
export const requireCustomer = (path = "/") => requirePayingCustomer(productSlug(), path);

/** The owner's businesses in the Post database (service role, filtered by owner). */
export const listBusinesses = cache(async (ownerId: string) => {
  const { data } = await postDb().from("businesses").select("*").eq("owner_id", ownerId).order("created_at");
  return data ?? [];
});

export type BusinessContext = { customer: PayingCustomer; business: BusinessRow; businesses: BusinessRow[]; settings: Settings; db: PostDb };

async function resolveBusiness(customer: PayingCustomer): Promise<Omit<BusinessContext, "customer"> | null> {
  const businesses = await listBusinesses(customer.id);
  if (!businesses.length) return null;
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value;
  const business = businesses.find((b) => b.id === chosen) ?? businesses[0]!;
  return { business, businesses, settings: readSettings(business), db: postDb() };
}

/** For pages: customer + their current business, or the welcome / no-access screen. */
export async function requireBusinessPage(path = "/"): Promise<BusinessContext> {
  const customer = await requireCustomer(path);
  const ctx = await resolveBusiness(customer);
  if (!ctx) redirect("/welcome");
  return { customer, ...ctx };
}

/**
 * For server actions: throws unless the caller is a paying customer who owns
 * a business. Every Post-database query in an action must use ctx.business.id.
 */
export async function requireBusiness(): Promise<BusinessContext> {
  const customer = await getCustomer();
  if (!customer) throw new AccessError("Please sign in again.");
  if (!customer.order) throw new AccessError("Retexia Post is not active on your account.");
  const paying = customer as PayingCustomer;
  const ctx = await resolveBusiness(paying);
  if (!ctx) throw new AccessError("Set up your business first.");
  return { customer: paying, ...ctx };
}

export const DEFAULT_SETTINGS: Settings = {
  playlist: { posts: 2, stories: 2, post_times: defaultTimes(2, false), story_times: defaultTimes(2, true), plan_time: "06:00" },
  caption_language: "si",
  design_language: "si",
  auto_publish: true,
  week_plan_enabled: false,
  slots: ["09:00", "13:00", "19:00"],
  content_mix: { photo: 2, reel: 1 },
  stories_per_day: 2,
  paused: false,
  whatsapp: { enabled: false, number: null, opted_in_at: null, types: ["items", "published", "alerts"], quiet_hours: ["22:00", "07:00"] },
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Times for n items: the saved ones (valid, in order) completed with the defaults. */
export function fitTimes(saved: unknown, count: number, story: boolean): string[] {
  const list = Array.isArray(saved) ? saved.filter((t): t is string => typeof t === "string" && TIME.test(t)) : [];
  const defaults = defaultTimes(count, story);
  return Array.from({ length: count }, (_, i) => list[i] ?? defaults[i]!).sort();
}

const WA_TYPES: Record<string, WhatsAppType> = { items: "items", published: "published", alerts: "alerts", morning: "items", evening: "published" };

/** WhatsApp settings; older saved types (morning, evening) map to the new ones. */
function readWhatsApp(saved: Partial<Settings["whatsapp"]> | undefined): Settings["whatsapp"] {
  const w = { ...DEFAULT_SETTINGS.whatsapp, ...(saved ?? {}) };
  const types = Array.isArray(saved?.types) ? [...new Set((saved.types as string[]).map((t) => WA_TYPES[t]).filter((t): t is WhatsAppType => Boolean(t)))] : DEFAULT_SETTINGS.whatsapp.types;
  const quiet = Array.isArray(w.quiet_hours) && w.quiet_hours.length === 2 && w.quiet_hours.every((t) => TIME.test(t)) ? w.quiet_hours : DEFAULT_SETTINGS.whatsapp.quiet_hours;
  return { ...w, types, quiet_hours: quiet };
}

/** Settings with defaults filled in and the playlist kept inside the plan's limits. */
export function readSettings(b: Pick<BusinessRow, "settings" | "plan" | "languages">): Settings {
  const s = (b.settings ?? {}) as Partial<Settings>;
  const limits = PLAN_LIMITS[b.plan] ?? PLAN_LIMITS.trial;
  const p = (s.playlist ?? {}) as Partial<Settings["playlist"]>;
  const posts = Math.max(0, Math.min(limits.postsPerDay, Number.isInteger(p.posts) ? p.posts! : Math.min(3, limits.postsPerDay)));
  const stories = Math.max(0, Math.min(limits.storiesPerDay, Number.isInteger(p.stories) ? p.stories! : Math.min(2, limits.storiesPerDay)));
  const langs = defaultLanguages(b.languages ?? []);
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    playlist: {
      posts,
      stories,
      post_times: fitTimes(p.post_times, posts, false),
      story_times: fitTimes(p.story_times, stories, true),
      plan_time: typeof p.plan_time === "string" && TIME.test(p.plan_time) ? p.plan_time : "06:00",
    },
    caption_language: isCaptionLanguage(s.caption_language) ? s.caption_language : langs.caption,
    design_language: isDesignLanguage(s.design_language) ? s.design_language : langs.design,
    slots: Array.isArray(s.slots) && s.slots.length === 3 ? s.slots : DEFAULT_SETTINGS.slots,
    content_mix: { ...DEFAULT_SETTINGS.content_mix, ...(s.content_mix ?? {}) },
    whatsapp: readWhatsApp(s.whatsapp),
  };
}
