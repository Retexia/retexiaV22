import "server-only";

import { createServerClient } from "@retexia/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { publicDb } from "./plan/db";
import { getSupport } from "./support";

/** Order statuses that unlock a product panel (paid and being set up, live, or paused; and a free trial while it runs). */
export const ACCESS_STATUSES = ["setting_up", "active", "paused", "trial"];

/** A request that opens the panel now: a "trial" only until trial_ends_at. */
export const opensPanel = (o: { status: string; trial_ends_at?: string | null }) =>
  o.status !== "trial" || (Boolean(o.trial_ends_at) && new Date(o.trial_ends_at!).getTime() > Date.now());

export type Customer = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  order: { id: string; ref: string; status: string; package_name: string | null } | null;
  /** Set when a Retexia admin is looking at this customer's panel in support mode. */
  support?: { staffName: string; expiresAt: string };
};
export type PayingCustomer = Customer & { order: NonNullable<Customer["order"]> };

/**
 * The signed-in Retexia customer (main project session, shared across
 * *.retexia.com) and their order for one product. Cached per request.
 */
export const getCustomer = cache(async (productSlug: string): Promise<Customer | null> => {
  const { userId, email, sb, support } = await actingUser();
  if (!userId) return null;
  const [{ data: profile }, { data: product }] = await Promise.all([
    sb.from("profiles").select("full_name, email, phone, whatsapp").eq("id", userId).maybeSingle(),
    sb.from("products").select("id").eq("slug", productSlug).maybeSingle(),
  ]);
  let order: Customer["order"] = null;
  if (product) {
    // Their own orders only (RLS for the customer; by user id in support mode).
    const { data: orders } = await sb
      .from("orders")
      .select("id, ref, status, package_name, created_at, trial_ends_at")
      .eq("user_id", userId)
      .eq("product_id", product.id)
      .in("status", ACCESS_STATUSES)
      .order("created_at", { ascending: false })
      .limit(5);
    const o = ((orders ?? []) as { id: string; ref: string | null; status: string; package_name: string | null; trial_ends_at: string | null }[]).find(opensPanel);
    if (o) order = { id: o.id, ref: o.ref ?? "", status: o.status, package_name: o.package_name };
  }
  return {
    id: userId,
    email: profile?.email ?? email ?? "",
    name: profile?.full_name ?? "",
    phone: profile?.whatsapp ?? profile?.phone ?? null,
    order,
    ...(support ? { support: { staffName: support.staffName, expiresAt: support.expiresAt } } : {}),
  };
});

/**
 * Who the panels act for: the signed-in customer (their own session, RLS), or
 * in support mode the customer a Retexia admin opened (service role, every
 * query limited to that customer's id). Cached per request.
 */
export const actingUser = cache(async () => {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { userId: null, email: null, sb: supabase, support: null };
  const support = await getSupport();
  if (support) return { userId: support.customerId, email: support.customerEmail, sb: publicDb() as unknown as typeof supabase, support };
  return { userId: data.user.id, email: data.user.email ?? null, sb: supabase, support: null };
});

/** The address this request came in on (post.retexia.com, lingo.retexia.com…). */
export async function selfOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3002";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** For pages: signed in with an active order for the product, or redirect. */
export async function requirePayingCustomer(productSlug: string, path = "/"): Promise<PayingCustomer> {
  const customer = await getCustomer(productSlug);
  if (!customer) redirect(`/auth/start?next=${encodeURIComponent(path)}`);
  if (!customer.order) redirect("/no-access");
  return customer as PayingCustomer;
}

/** Setup values the Retexia team filled in for this order (visible-to-customer fields only). */
export async function orderSetupValue(orderId: string, key: string): Promise<string | null> {
  const { support } = await actingUser();
  if (support) {
    // Same rules as customer_order_service_fields(), for the customer being helped.
    const db = publicDb();
    const { data: o } = await db.from("orders").select("product_id, service_data").eq("id", orderId).eq("user_id", support.customerId).maybeSingle();
    if (!o) return null;
    const { data: f } = await db.from("product_service_fields").select("key").eq("product_id", o.product_id).eq("key", key).eq("visible_to_customer", true).eq("is_visible", true).neq("type", "secret").maybeSingle();
    const v = f ? (o.service_data as Record<string, unknown> | null)?.[key] : null;
    return v == null ? null : String(v).trim() || null;
  }
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("customer_order_service_fields", { p_order_id: orderId });
  const field = (Array.isArray(data) ? (data as { key: string; value: unknown }[]) : []).find((f) => f.key === key);
  return field?.value == null ? null : String(field.value).trim() || null;
}
