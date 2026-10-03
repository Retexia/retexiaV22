"use server";

import { requireRole } from "@/lib/auth";
import { ilike } from "@/lib/list-params";

export type RequestOption = {
  id: string;
  ref: string;
  customer: string;
  userId: string | null;
  currency: string;
  price: number;
  setupFee: number;
  billing: string;
  renewsAt: string | null;
};

/** Find a request by ref or customer to record a payment against. */
export async function findRequests(query: string): Promise<RequestOption[]> {
  const { supabase } = await requireRole("operate");
  if (query.trim().length < 2) return [];
  const { data } = await supabase
    .from("staff_orders")
    .select("id, ref, customer_name, user_id, currency, price_amount, setup_fee, billing_cycle, renews_at")
    .ilike("search", ilike(query))
    .order("created_at", { ascending: false })
    .limit(8);
  return (data ?? []).map((o) => ({
    id: o.id ?? "",
    ref: o.ref ?? "",
    customer: o.customer_name ?? "Customer",
    userId: o.user_id,
    currency: o.currency ?? "LKR",
    price: Number(o.price_amount ?? 0),
    setupFee: Number(o.setup_fee ?? 0),
    billing: o.billing_cycle ?? "monthly",
    renewsAt: o.renews_at,
  }));
}
