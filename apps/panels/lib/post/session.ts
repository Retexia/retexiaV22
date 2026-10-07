import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AccessError } from "../action";
import { getCustomer as getCustomerFor, requirePayingCustomer, type Customer, type PayingCustomer } from "../customer";
import { postDb, type PostDb } from "./post-db";
import type { BusinessRow, Settings } from "./post-db.types";

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
  auto_publish: true,
  week_plan_enabled: false,
  slots: ["09:00", "13:00", "19:00"],
  content_mix: { photo: 2, reel: 1 },
  stories_per_day: 3,
  paused: false,
  whatsapp: { enabled: false, number: null, opted_in_at: null, types: ["morning", "evening", "alerts"], quiet_hours: ["22:00", "07:00"] },
};

export function readSettings(b: Pick<BusinessRow, "settings">): Settings {
  const s = (b.settings ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    slots: Array.isArray(s.slots) && s.slots.length === 3 ? s.slots : DEFAULT_SETTINGS.slots,
    content_mix: { ...DEFAULT_SETTINGS.content_mix, ...(s.content_mix ?? {}) },
    whatsapp: { ...DEFAULT_SETTINGS.whatsapp, ...(s.whatsapp ?? {}) },
  };
}
