import "server-only";

import type { StaffContext } from "../auth";
import { ilike, listParams, param, type SearchParams } from "../list-params";

const SORTABLE = new Set(["full_name", "email", "created_at", "last_sign_in_at", "lifetime_paid", "orders_count"]);

export const CUSTOMER_COLUMNS =
  "id, full_name, email, phone, whatsapp, business_name, role, created_at, last_sign_in_at, email_confirmed_at, is_banned, lifetime_paid, active_products, orders_count, mfa_enabled";

export type CustomerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  business_name: string | null;
  role: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  is_banned: boolean | null;
  lifetime_paid: number | null;
  active_products: string[] | null;
  orders_count: number | null;
  mfa_enabled: boolean | null;
};

export async function listCustomers(staff: StaffContext, sp: SearchParams, opts: { all?: boolean; staffOnly?: boolean } = {}) {
  const { sort, from, to } = listParams(sp, { id: "created_at", desc: true });
  let query = staff.supabase.from("staff_customers").select(CUSTOMER_COLUMNS, { count: "exact" });
  query = opts.staffOnly ? query.neq("role", "customer") : query.eq("role", "customer");
  const q = param(sp, "q");
  if (q) query = query.ilike("search", ilike(q));
  const status = param(sp, "status");
  if (status === "banned") query = query.eq("is_banned", true);
  else if (status === "active") query = query.eq("is_banned", false);
  else if (status === "unconfirmed") query = query.is("email_confirmed_at", null);
  const product = param(sp, "product");
  if (product) query = query.contains("active_products", [product]);
  query = query.order(SORTABLE.has(sort.id) ? sort.id : "created_at", { ascending: !sort.desc, nullsFirst: false });
  query = opts.all ? query.limit(10000) : query.range(from, to);
  const { data, count, error } = await query;
  if (error) console.error("[customers] list failed:", error.message);
  return { rows: (data ?? []) as unknown as CustomerRow[], count: count ?? 0 };
}
