"use server";

import { createAdminSchemaClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";

const feeder = () => createAdminSchemaClient("feeder");

const input = z.object({
  user_id: z.uuid(),
  platform: z.enum(["meta", "tiktok"]),
  status: z.enum(["connected", "problem", "requested"]),
  note: z.string().trim().max(500).default(""),
});

/**
 * Autopublish: Retexia confirms (or stops) a customer's ad account after
 * checking in Business Manager / Business Center that it really is theirs and
 * that the System User has it. Only admins and owners: it lets launches spend
 * on that account.
 */
export async function setAdAccountStatus(raw: z.input<typeof input>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = input.parse(raw);
    const col = d.platform === "meta" ? "meta_status" : "tiktok_status";
    const idCol = d.platform === "meta" ? "meta_ad_account_id" : "tiktok_advertiser_id";
    const db = feeder();
    const { data: before } = await db.from("ad_accounts").select(`user_id, ${col}, ${idCol}`).eq("user_id", d.user_id).maybeSingle();
    if (!before) return { ok: false, message: "That customer has no Autopublish account." };
    const row = before as unknown as Record<string, string | null>;
    if (!row[idCol]) return { ok: false, message: "There's no account ID to confirm." };
    const { error } = await db
      .from("ad_accounts")
      .update({ [col]: d.status, review_note: d.note || null, reviewed_by: staff.user.id, reviewed_at: new Date().toISOString() })
      .eq("user_id", d.user_id);
    if (error) return { ok: false, message: dbMessage(error) };
    await db.from("ad_events").insert({
      user_id: d.user_id,
      type: `account.${d.status}`,
      actor: "admin",
      message: d.status === "connected" ? `Retexia confirmed your ${d.platform === "meta" ? "Meta" : "TikTok"} account: you can launch now.` : `Your ${d.platform === "meta" ? "Meta" : "TikTok"} account needs attention${d.note ? `: ${d.note}` : "."}`,
    });
    await audit(staff, {
      action: `feeder.ad_account.${d.status}`,
      table: "feeder.ad_accounts",
      recordId: d.user_id,
      summary: `${d.platform} ${row[idCol]} → ${d.status}${d.note ? ` (${d.note})` : ""}`,
      before: { status: row[col] },
      after: { status: d.status },
    });
    revalidatePath("/products/feeder");
    return { ok: true, message: d.status === "connected" ? "Connected: the customer can launch" : "Saved" };
  });
}

/** Unknown platform errors: Retexia writes the plain message and what to do, then they're used for everyone. */
const catalogInput = z.object({
  id: z.number().int().positive(),
  category: z.enum(["TRANSIENT", "RATE_LIMIT", "AUTH", "PERMISSION", "ACCOUNT", "BILLING", "VALIDATION", "CREATIVE", "POLICY", "LIMIT"]),
  action: z.enum(["retry", "wait_rate_limit", "needs_client", "needs_admin"]),
  client_message: z.string().trim().min(5).max(400),
});

export async function publishCatalogEntry(raw: z.input<typeof catalogInput>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = catalogInput.parse(raw);
    const { error } = await feeder().from("ad_error_catalog").update({ category: d.category, action: d.action, client_message: d.client_message, is_draft: false, sort: 50 }).eq("id", d.id).eq("is_draft", true);
    if (error) return { ok: false, message: dbMessage(error) };
    await audit(staff, { action: "feeder.error_catalog.publish", table: "feeder.ad_error_catalog", recordId: String(d.id), summary: `${d.category} / ${d.action}: ${d.client_message.slice(0, 120)}` });
    revalidatePath("/products/feeder");
    return { ok: true, message: "Added to the error catalog" };
  });
}
