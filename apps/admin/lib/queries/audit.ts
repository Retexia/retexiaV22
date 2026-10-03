import "server-only";

import type { StaffContext } from "@/lib/auth";
import { ilike, param, type SearchParams } from "@/lib/list-params";

/** Audit log query with the page's filters (actor, action, table, record, dates, text). */
export function auditQuery(staff: StaffContext, sp: SearchParams) {
  let q = staff.supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false });
  const actor = param(sp, "actor");
  const action = param(sp, "action");
  const table = param(sp, "table");
  const record = param(sp, "record");
  const from = param(sp, "from");
  const to = param(sp, "to");
  const text = param(sp, "q");
  if (actor) q = q.eq("actor_email", actor);
  if (action) q = q.eq("action", action);
  if (table) q = q.eq("table_name", table);
  if (record) q = q.eq("record_id", record);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("created_at", `${from}T00:00:00Z`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lt("created_at", new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000).toISOString());
  if (text) q = q.or(`summary.ilike.${ilike(text)},record_id.ilike.${ilike(text)},actor_email.ilike.${ilike(text)}`);
  return q;
}
