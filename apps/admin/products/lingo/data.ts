import "server-only";

import { createAdminClient, createAdminSchemaClient } from "@retexia/supabase/admin";

export type LingoAccountRow = {
  id: number;
  owner_id: string | null;
  business_name: string;
  evolution_instance: string;
  evolution_base_url: string;
  owner_phone: string | null;
  staff_name: string | null;
  default_language: string;
  content_language: string;
  followup_hours: number;
  delivery_days: number;
  active: boolean;
  created_at: string;
};
export type LingoOverview = {
  customers: number;
  new_customers_30d: number;
  messages_30d: number;
  orders_30d: number;
  open_orders: number;
  sales_30d: number;
  products: number;
  last_message_at: string | null;
};
export type LingoOwner = { id: string; name: string; email: string | null; orderRef: string | null; orderStatus: string | null };

/** Never select evolution_apikey for the admin pages: it is write-only. */
const COLS = "id, owner_id, business_name, evolution_instance, evolution_base_url, owner_phone, staff_name, default_language, content_language, followup_hours, delivery_days, active, created_at";
const EMPTY: LingoOverview = { customers: 0, new_customers_30d: 0, messages_30d: 0, orders_30d: 0, open_orders: 0, sales_30d: 0, products: 0, last_message_at: null };

async function overviewMap() {
  const { data, error } = await createAdminSchemaClient("lingo").rpc("admin_overview");
  const map = new Map<number, LingoOverview>();
  for (const r of (data ?? []) as (LingoOverview & { lingo_user_id: number })[]) {
    map.set(Number(r.lingo_user_id), {
      customers: Number(r.customers),
      new_customers_30d: Number(r.new_customers_30d),
      messages_30d: Number(r.messages_30d),
      orders_30d: Number(r.orders_30d),
      open_orders: Number(r.open_orders),
      sales_30d: Number(r.sales_30d),
      products: Number(r.products),
      last_message_at: r.last_message_at,
    });
  }
  return { map, error: error?.message ?? null };
}

/** Retexia customers who own bot accounts, with their Lingo request. */
async function owners(ids: string[]): Promise<Map<string, LingoOwner>> {
  const map = new Map<string, LingoOwner>();
  if (!ids.length) return map;
  const db = createAdminClient();
  const [{ data: profiles }, { data: orders }] = await Promise.all([
    db.from("profiles").select("id, full_name, email").in("id", ids),
    db.from("staff_orders").select("user_id, ref, status, created_at").eq("product_slug", process.env.LINGO_PRODUCT_SLUG || "lingo").in("user_id", ids).order("created_at", { ascending: false }),
  ]);
  for (const p of profiles ?? []) {
    const o = (orders ?? []).find((x) => x.user_id === p.id);
    map.set(p.id, { id: p.id, name: p.full_name || p.email || "Customer", email: p.email, orderRef: o?.ref ?? null, orderStatus: o?.status ?? null });
  }
  return map;
}

export async function listLingoAccounts() {
  const db = createAdminSchemaClient("lingo");
  const [{ data, error }, stats] = await Promise.all([db.from("lingo_users").select(COLS).order("business_name"), overviewMap()]);
  if (error) return { error: error.message, rows: [] };
  const accounts = (data ?? []) as LingoAccountRow[];
  const people = await owners([...new Set(accounts.map((a) => a.owner_id).filter((x): x is string => Boolean(x)))]);
  return {
    error: stats.error,
    rows: accounts.map((a) => ({ ...a, stats: stats.map.get(a.id) ?? EMPTY, owner: a.owner_id ? (people.get(a.owner_id) ?? null) : null })),
  };
}

export async function getLingoAccount(id: number) {
  const db = createAdminSchemaClient("lingo");
  const [{ data }, stats, orders, products, details] = await Promise.all([
    db.from("lingo_users").select(COLS).eq("id", id).maybeSingle(),
    overviewMap(),
    db.from("orders").select("id, product_name, quantity, total_price, status, customer_name, created_at").eq("lingo_user_id", id).neq("status", "draft").order("created_at", { ascending: false }).limit(10),
    db.from("products").select("id, product_name, price, active").eq("lingo_user_id", id).order("product_name").limit(100),
    db.from("business_details").select("business_type, address, contact_phone, delivery_areas, payment_methods, updated_at").eq("lingo_user_id", id).maybeSingle(),
  ]);
  if (!data) return null;
  const account = data as LingoAccountRow;
  const owner = account.owner_id ? ((await owners([account.owner_id])).get(account.owner_id) ?? null) : null;
  return {
    account,
    owner,
    stats: stats.map.get(id) ?? EMPTY,
    orders: (orders.data ?? []) as { id: number; product_name: string | null; quantity: number; total_price: number; status: string; customer_name: string | null; created_at: string }[],
    products: (products.data ?? []) as { id: number; product_name: string; price: number; active: boolean }[],
    details: details.data as Record<string, string | null> | null,
  };
}
