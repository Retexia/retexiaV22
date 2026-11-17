import "server-only";

import { createServerClient } from "@retexia/supabase/server";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { publicDb } from "./plan/db";

/**
 * Support mode: a Retexia admin/owner opens a customer's panels as that
 * customer (started in admin.retexia.com with a reason, see
 * supabase/migrations/0034_support_sessions.sql).
 *
 * The browser keeps its own login (the team member's). A separate httpOnly
 * cookie holds a random secret whose hash names an open support session; it
 * only counts while the SAME team member is signed in, the session hasn't
 * ended or expired, and they are still an admin or owner. Then
 * getCustomer() / getFeeder() / getPlanUser() answer with the customer.
 */
export const SUPPORT_COOKIE = "rx_support";
export const SUPPORT_ROLES = ["admin", "owner"];
export const SECRET = /^[A-Za-z0-9_-]{40,100}$/;

export const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");
export const newSecret = () => randomBytes(32).toString("base64url");

export type Support = {
  id: string;
  staffId: string;
  staffName: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  reason: string;
  expiresAt: string;
};

/** The open support session for this browser and signed-in team member, or null. Cached per request. */
export const getSupport = cache(async (): Promise<Support | null> => {
  const secret = (await cookies()).get(SUPPORT_COOKIE)?.value;
  if (!secret || !SECRET.test(secret)) return null;
  const { data: auth } = await (await createServerClient()).auth.getUser();
  if (!auth.user) return null;
  const db = publicDb();
  const { data: s } = await db.from("support_sessions").select("id, staff_id, customer_id, reason, expires_at, ended_at").eq("cookie_hash", hashSecret(secret)).maybeSingle();
  if (!s || s.ended_at || new Date(s.expires_at).getTime() <= Date.now() || s.staff_id !== auth.user.id) return null;
  const { data: people } = await db.from("profiles").select("id, full_name, email, role").in("id", [s.staff_id, s.customer_id]);
  const staff = (people ?? []).find((p) => p.id === s.staff_id);
  const customer = (people ?? []).find((p) => p.id === s.customer_id);
  if (!staff || !SUPPORT_ROLES.includes(staff.role) || !customer) return null;
  return {
    id: s.id,
    staffId: s.staff_id,
    staffName: staff.full_name || staff.email || "Retexia team",
    customerId: s.customer_id,
    customerName: customer.full_name || customer.email || "the customer",
    customerEmail: customer.email ?? "",
    reason: s.reason,
    expiresAt: s.expires_at,
  };
});

/** An audit entry (admin → Activity) for things done in support mode. */
export async function supportAudit(s: Pick<Support, "staffId" | "customerId">, action: string, summary: string, actorEmail?: string | null) {
  const { error } = await publicDb()
    .from("audit_logs")
    .insert({ actor_id: s.staffId, actor_email: actorEmail ?? null, actor_role: "admin", action, table_name: "profiles", record_id: s.customerId, summary: summary.slice(0, 500) });
  if (error) console.error("[support] audit failed:", error.message);
}
