import "server-only";

import { createServerClient } from "@retexia/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AccessError } from "./action";
import { postUrl, webUrl } from "./env";
import { postDb, type PostDb } from "./post-db";
import type { BusinessRow, Settings } from "./post-db.types";

/** Order statuses that unlock the panel (paid and being set up, live, or paused). */
const ACCESS_STATUSES = ["setting_up", "active", "paused"];
export const BUSINESS_COOKIE = "rx_post_business";
const productSlug = () => process.env.POST_PRODUCT_SLUG || "post";

export type Customer = {
  id: string;
  email: string;
  name: string;
  order: { ref: string; status: string; package_name: string | null } | null;
};

/**
 * The signed-in Retexia customer (main project session, shared across
 * *.retexia.com) and their Retexia Post order. Cached per request.
 */
export const getCustomer = cache(async (): Promise<Customer | null> => {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const [{ data: profile }, { data: product }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", data.user.id).maybeSingle(),
    supabase.from("products").select("id").eq("slug", productSlug()).maybeSingle(),
  ]);
  let order: Customer["order"] = null;
  if (product) {
    // RLS: customers only see their own orders.
    const { data: orders } = await supabase
      .from("orders")
      .select("ref, status, package_name, created_at")
      .eq("product_id", product.id)
      .in("status", ACCESS_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);
    const o = orders?.[0];
    if (o) order = { ref: o.ref ?? "", status: o.status, package_name: o.package_name };
  }
  return {
    id: data.user.id,
    email: profile?.email ?? data.user.email ?? "",
    name: profile?.full_name ?? "",
    order,
  };
});

/** For pages: signed in with an active Post order, or redirect. */
export async function requireCustomer(path = "/"): Promise<PayingCustomer> {
  const customer = await getCustomer();
  if (!customer) redirect(`${webUrl()}/login?next=${encodeURIComponent(`${postUrl()}${path}`)}`);
  if (!customer.order) redirect("/no-access");
  return customer as PayingCustomer;
}

/** The owner's businesses in the Post database (service role, filtered by owner). */
export const listBusinesses = cache(async (ownerId: string) => {
  const { data } = await postDb().from("businesses").select("*").eq("owner_id", ownerId).order("created_at");
  return data ?? [];
});

export type PayingCustomer = Customer & { order: NonNullable<Customer["order"]> };
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

/**
 * businesses.owner_id references the Post project's auth.users, so the Retexia
 * login is mirrored there with the same id. If the Post project already has a
 * login with the same (verified) email, for example one created while testing
 * the n8n workflow, its businesses move to the mirrored login.
 */
export async function ensurePostUser(customer: Customer) {
  const db = postDb();
  const { data } = await db.auth.admin.getUserById(customer.id);
  if (data.user) return;

  const email = customer.email.toLowerCase();
  let existing: { id: string } | null = null;
  for (let page = 1; page <= 20 && !existing; page++) {
    const { data: list, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not read Retexia Post logins: ${error.message}`);
    existing = list.users.find((u) => u.email?.toLowerCase() === email) ?? null;
    if (list.users.length < 1000) break;
  }
  if (existing) {
    // Free the email for the mirrored login (emails are unique), then move the businesses.
    const [local, domain] = email.split("@");
    await db.auth.admin.updateUserById(existing.id, { email: `${local}+legacy-${existing.id.slice(0, 8)}@${domain}`, email_confirm: true });
  }
  const { error } = await db.auth.admin.createUser({
    id: customer.id,
    email,
    email_confirm: true,
    user_metadata: { full_name: customer.name, source: "retexia" },
  });
  if (error && !/already/i.test(error.message)) throw new Error(`Could not link your Retexia account: ${error.message}`);
  if (existing) await db.from("businesses").update({ owner_id: customer.id }).eq("owner_id", existing.id);
}
