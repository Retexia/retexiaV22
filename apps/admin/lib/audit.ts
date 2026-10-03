import "server-only";

import { createAdminClient } from "@retexia/supabase/admin";
import { headers } from "next/headers";
import type { StaffContext } from "./auth";

/**
 * Explicit audit entry for things the database triggers can't see (Auth admin
 * API calls, n8n requests, secret reads through the service role).
 */
export async function audit(
  staff: StaffContext | null,
  entry: { action: string; table?: string; recordId?: string; summary: string; before?: unknown; after?: unknown },
) {
  const h = await headers();
  const { error } = await createAdminClient().from("audit_logs").insert({
    actor_id: staff?.user.id ?? null,
    actor_email: staff?.user.email ?? null,
    actor_role: staff?.role ?? "system",
    action: entry.action,
    table_name: entry.table ?? null,
    record_id: entry.recordId ?? null,
    summary: entry.summary,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null,
    user_agent: h.get("user-agent"),
  });
  if (error) console.error("[audit] failed:", error.message);
}
