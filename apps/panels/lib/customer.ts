import "server-only";

import { createServerClient } from "@retexia/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { webUrl } from "./env";

/** Order statuses that unlock a product panel (paid and being set up, live, or paused). */
const ACCESS_STATUSES = ["setting_up", "active", "paused"];

export type Customer = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  order: { id: string; ref: string; status: string; package_name: string | null } | null;
};
export type PayingCustomer = Customer & { order: NonNullable<Customer["order"]> };

/**
 * The signed-in Retexia customer (main project session, shared across
 * *.retexia.com) and their order for one product. Cached per request.
 */
export const getCustomer = cache(async (productSlug: string): Promise<Customer | null> => {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const [{ data: profile }, { data: product }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, phone, whatsapp").eq("id", data.user.id).maybeSingle(),
    supabase.from("products").select("id").eq("slug", productSlug).maybeSingle(),
  ]);
  let order: Customer["order"] = null;
  if (product) {
    // RLS: customers only see their own orders.
    const { data: orders } = await supabase
      .from("orders")
      .select("id, ref, status, package_name, created_at")
      .eq("product_id", product.id)
      .in("status", ACCESS_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);
    const o = orders?.[0];
    if (o) order = { id: o.id, ref: o.ref ?? "", status: o.status, package_name: o.package_name };
  }
  return {
    id: data.user.id,
    email: profile?.email ?? data.user.email ?? "",
    name: profile?.full_name ?? "",
    phone: profile?.whatsapp ?? profile?.phone ?? null,
    order,
  };
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
  if (!customer) redirect(`${webUrl()}/login?next=${encodeURIComponent(`${await selfOrigin()}${path}`)}`);
  if (!customer.order) redirect("/no-access");
  return customer as PayingCustomer;
}

/** Setup values the Retexia team filled in for this order (visible-to-customer fields only). */
export async function orderSetupValue(orderId: string, key: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("customer_order_service_fields", { p_order_id: orderId });
  const field = (Array.isArray(data) ? (data as { key: string; value: unknown }[]) : []).find((f) => f.key === key);
  return field?.value == null ? null : String(field.value).trim() || null;
}
