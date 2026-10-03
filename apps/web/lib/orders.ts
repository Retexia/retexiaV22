import "server-only";

import type { Database, SupabaseClient, Tables } from "@retexia/supabase";
import type { Answer } from "./forms/engine";

/** Every orders column a customer may read (admin_note is not granted). */
const ORDER_COLUMNS =
  "id, ref, status, status_note, billing_cycle, package_name, price_amount, setup_fee, currency, answers, form_version, product_id, package_id, created_at, updated_at, starts_at, renews_at, cancelled_at";

export type CustomerOrder = Omit<Tables<"orders">, "admin_note" | "user_id" | "form_id" | "customer_note"> & {
  answers: Answer[];
};
export type OrderEvent = Tables<"order_events">;

type Client = SupabaseClient<Database>;

function normalise(row: Record<string, unknown>): CustomerOrder {
  const answers = Array.isArray(row.answers) ? (row.answers as Answer[]) : [];
  return { ...(row as unknown as CustomerOrder), answers };
}

export async function getMyOrders(supabase: Client): Promise<CustomerOrder[]> {
  const { data, error } = await supabase.from("orders").select(ORDER_COLUMNS).order("created_at", { ascending: false });
  if (error) console.error("[orders] list failed:", error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalise);
}

export async function getMyOrder(supabase: Client, ref: string) {
  const { data, error } = await supabase.from("orders").select(ORDER_COLUMNS).eq("ref", ref).maybeSingle();
  if (error) console.error("[orders] get failed:", error.message);
  if (!data) return null;
  const order = normalise(data as Record<string, unknown>);
  const { data: events } = await supabase
    .from("order_events")
    .select("*")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  return { order, events: events ?? [] };
}

export type OrderGroup = "active" | "in_progress" | "closed";

/** Filter group for the My products tabs. */
export function orderGroup(status: string, isFinal: boolean): OrderGroup {
  if (isFinal) return "closed";
  if (status === "active") return "active";
  return "in_progress";
}
