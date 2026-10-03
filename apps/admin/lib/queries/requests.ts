import "server-only";

import type { StaffContext } from "../auth";
import { ilike, listParams, param, type SearchParams } from "../list-params";

export const REQUEST_TABS = [
  { key: "needs_action", label: "Needs action" },
  { key: "in_setup", label: "In setup" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
] as const;
export type RequestTab = (typeof REQUEST_TABS)[number]["key"];

const SORTABLE = new Set(["ref", "created_at", "renews_at", "price_amount", "status", "customer_name", "package_name"]);

type Query = ReturnType<StaffContext["supabase"]["from"]>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder types vary with the select string
function applyTab(query: any, tab: RequestTab) {
  switch (tab) {
    case "needs_action":
      return query.or("status.in.(submitted,reviewing),and(status.eq.awaiting_payment,pending_payments.gt.0)");
    case "in_setup":
      return query.in("status", ["awaiting_payment", "setting_up"]);
    case "active":
      return query.eq("status", "active");
    case "paused":
      return query.eq("status", "paused");
    case "closed":
      return query.eq("status_is_final", true);
    default:
      return query;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
function applyFilters(query: any, sp: SearchParams, userId: string) {
  const q = param(sp, "q");
  if (q) query = query.ilike("search", ilike(q));
  const product = param(sp, "product");
  if (product) query = query.eq("product_slug", product);
  const pkg = param(sp, "package");
  if (pkg) query = query.eq("package_id", pkg);
  const status = param(sp, "status");
  if (status) query = query.eq("status", status);
  const assigned = param(sp, "assigned");
  if (assigned === "me") query = query.eq("assigned_to", userId);
  else if (assigned === "none") query = query.is("assigned_to", null);
  else if (assigned) query = query.eq("assigned_to", assigned);
  const source = param(sp, "source");
  if (source) query = query.eq("source", source);
  const billing = param(sp, "billing");
  if (billing) query = query.eq("billing_cycle", billing);
  const from = param(sp, "from");
  if (from) query = query.gte("created_at", from);
  const to = param(sp, "to");
  if (to) query = query.lt("created_at", new Date(new Date(to).getTime() + 86400000).toISOString());
  const renewal = param(sp, "renewal");
  if (renewal === "due") {
    query = query.eq("status", "active").gte("renews_at", new Date().toISOString()).lt("renews_at", new Date(Date.now() + 7 * 86400000).toISOString());
  } else if (renewal === "overdue") {
    query = query.eq("status", "active").lt("renews_at", new Date().toISOString());
  }
  const ids = param(sp, "ids");
  if (ids) query = query.in("id", ids.split(",").slice(0, 500));
  return query;
}

export const REQUEST_COLUMNS =
  "id, ref, status, status_label, status_tone, status_is_final, billing_cycle, price_amount, setup_fee, currency, package_id, package_name, product_slug, product_short_name, product_name, customer_name, customer_email, customer_phone, customer_business, user_id, assigned_to, assignee_name, source, created_at, renews_at, starts_at, pending_payments, paid_total";

export type RequestRow = {
  id: string;
  ref: string | null;
  status: string | null;
  status_label: string | null;
  status_tone: string | null;
  status_is_final: boolean | null;
  billing_cycle: string | null;
  price_amount: number | null;
  setup_fee: number | null;
  currency: string | null;
  package_id: string | null;
  package_name: string | null;
  product_slug: string | null;
  product_short_name: string | null;
  product_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_business: string | null;
  user_id: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  source: string | null;
  created_at: string | null;
  renews_at: string | null;
  starts_at: string | null;
  pending_payments: number | null;
  paid_total: number | null;
};

export async function listRequests(staff: StaffContext, sp: SearchParams, opts: { all?: boolean } = {}) {
  const { supabase, user } = staff;
  const tab = (param(sp, "tab") ?? "needs_action") as RequestTab;
  const { sort, from, to } = listParams(sp, { id: "created_at", desc: true });
  let query = supabase.from("staff_orders").select(REQUEST_COLUMNS, { count: "exact" });
  query = applyFilters(applyTab(query, tab), sp, user.id);
  query = query.order(SORTABLE.has(sort.id) ? sort.id : "created_at", { ascending: !sort.desc, nullsFirst: false });
  if (!opts.all) query = query.range(from, to);
  else query = query.limit(5000);
  const { data, count, error } = await query;
  if (error) console.error("[requests] list failed:", error.message);
  return { rows: (data ?? []) as unknown as RequestRow[], count: count ?? 0, tab };
}

/** Counts per tab for the current filters (without the tab itself). */
export async function requestTabCounts(staff: StaffContext, sp: SearchParams) {
  const entries = await Promise.all(
    REQUEST_TABS.map(async (t) => {
      let query: Query = staff.supabase.from("staff_orders").select("id", { count: "exact", head: true }) as unknown as Query;
      query = applyFilters(applyTab(query, t.key), sp, staff.user.id);
      const { count } = await (query as unknown as Promise<{ count: number | null }>);
      return [t.key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<RequestTab, number>;
}
