import "server-only";

import type { StaffContext } from "../auth";
import { ilike, listParams, param, type SearchParams } from "../list-params";

const SORTABLE = new Set(["created_at", "paid_at", "amount", "status", "kind", "receipt_number"]);

export const PAYMENT_COLUMNS =
  "id, order_id, order_ref, product_slug, product_short_name, package_name, billing_cycle, customer_name, customer_email, customer_business, kind, amount, signed_amount, currency, method, reference, status, paid_at, created_at, period_start, period_end, receipt_number, proof_path, note, recorded_by_name, user_id";

export type PaymentListRow = {
  id: string;
  order_id: string;
  order_ref: string | null;
  product_slug: string | null;
  product_short_name: string | null;
  package_name: string | null;
  billing_cycle: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_business: string | null;
  kind: string;
  amount: number;
  signed_amount: number;
  currency: string | null;
  method: string;
  reference: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  period_start: string | null;
  period_end: string | null;
  receipt_number: string | null;
  proof_path: string | null;
  note: string | null;
  recorded_by_name: string | null;
  user_id: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder
function applyFilters(query: any, sp: SearchParams) {
  const q = param(sp, "q");
  if (q) query = query.ilike("search", ilike(q));
  for (const key of ["kind", "method", "status"] as const) {
    const v = param(sp, key);
    if (v) query = query.eq(key, v);
  }
  const product = param(sp, "product");
  if (product) query = query.eq("product_slug", product);
  if (param(sp, "tab") === "proofs") query = query.eq("status", "pending").not("proof_path", "is", null);
  const from = param(sp, "from");
  if (from) query = query.gte("created_at", from);
  const to = param(sp, "to");
  if (to) query = query.lt("created_at", new Date(new Date(to).getTime() + 86400000).toISOString());
  const order = param(sp, "order");
  if (order) query = query.eq("order_id", order);
  return query;
}

export async function listPayments(staff: StaffContext, sp: SearchParams, opts: { all?: boolean } = {}) {
  const { sort, from, to } = listParams(sp, { id: "created_at", desc: true });
  let query = staff.supabase.from("staff_payments").select(PAYMENT_COLUMNS, { count: "exact" });
  query = applyFilters(query, sp);
  query = query.order(SORTABLE.has(sort.id) ? sort.id : "created_at", { ascending: !sort.desc, nullsFirst: false });
  query = opts.all ? query.limit(10000) : query.range(from, to);
  const { data, count, error } = await query;
  if (error) console.error("[payments] list failed:", error.message);
  return { rows: (data ?? []) as unknown as PaymentListRow[], count: count ?? 0 };
}

/** Totals for the current filters (all pages). */
export async function paymentTotals(staff: StaffContext, sp: SearchParams) {
  let query = staff.supabase.from("staff_payments").select("signed_amount, status, currency").limit(20000);
  query = applyFilters(query, sp);
  const { data } = await query;
  const rows = data ?? [];
  const sum = (status: string) => rows.filter((r) => r.status === status).reduce((s, r) => s + Number(r.signed_amount ?? 0), 0);
  const { count: proofs } = await staff.supabase
    .from("staff_payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .not("proof_path", "is", null);
  return { confirmed: sum("confirmed"), pending: sum("pending"), refunded: sum("refunded"), proofs: proofs ?? 0 };
}
