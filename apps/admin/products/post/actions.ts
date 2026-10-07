"use server";

import { createAdminClient, createAdminSchemaClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";

const uuid = z.uuid();
const post = () => createAdminSchemaClient("post");
function refresh(id?: string) {
  revalidatePath("/products/post");
  if (id) revalidatePath(`/products/post/businesses/${id}`);
}

/** Global switches: stop all AI generation and/or all publishing for every business. */
export async function setPostSystem(input: { generation_paused: boolean; publishing_paused: boolean; note?: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const d = z.object({ generation_paused: z.boolean(), publishing_paused: z.boolean(), note: z.string().trim().max(300).optional() }).parse(input);
    const { error } = await post()
      .from("system_settings")
      .upsert({ id: 1, ...d, note: d.note || null, updated_at: new Date().toISOString(), updated_by: staff.user.id });
    if (error) return { ok: false, message: error.message.includes("system_settings") ? "Run migration 0007_product_controls.sql first." : error.message };
    await audit(staff, {
      action: "post.system",
      table: "post.system_settings",
      recordId: "1",
      summary: `Retexia Post: generation ${d.generation_paused ? "paused" : "on"}, publishing ${d.publishing_paused ? "paused" : "on"}${d.note ? ` (${d.note})` : ""}`,
    });
    refresh();
    return { ok: true, message: d.publishing_paused || d.generation_paused ? "Paused for every business" : "Everything is running" };
  });
}

/** Pause one business (vacation mode): no new posts, nothing published. */
export async function setPostBusinessPaused(input: { id: string; paused: boolean }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("operate");
    const d = z.object({ id: uuid, paused: z.boolean() }).parse(input);
    const db = post();
    const { data: b } = await db.from("businesses").select("name, settings").eq("id", d.id).maybeSingle();
    if (!b) return { ok: false, message: "Business not found." };
    const settings = { ...((b.settings as Record<string, unknown>) ?? {}), paused: d.paused };
    const { error } = await db.from("businesses").update({ settings, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) return { ok: false, message: error.message };
    await audit(staff, { action: d.paused ? "post.pause" : "post.resume", table: "post.businesses", recordId: d.id, summary: `${d.paused ? "Paused" : "Resumed"} Retexia Post for ${b.name}` });
    refresh(d.id);
    return { ok: true, message: d.paused ? "Paused: nothing is generated or published" : "Running again" };
  });
}

/** Plan (allowances) and subscription status. Cancelled or overdue businesses stop posting. */
export async function savePostSubscription(input: { id: string; plan: string; subscription_status: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const d = z
      .object({ id: uuid, plan: z.enum(["trial", "starter", "growth", "pro"]), subscription_status: z.enum(["trialing", "active", "past_due", "canceled"]) })
      .parse(input);
    const db = post();
    const { data: before } = await db.from("businesses").select("name, plan, subscription_status").eq("id", d.id).maybeSingle();
    if (!before) return { ok: false, message: "Business not found." };
    const { error } = await db.from("businesses").update({ plan: d.plan, subscription_status: d.subscription_status, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) return { ok: false, message: error.message };
    await audit(staff, {
      action: "post.subscription",
      table: "post.businesses",
      recordId: d.id,
      summary: `${before.name}: plan ${before.plan} → ${d.plan}, status ${before.subscription_status} → ${d.subscription_status}`,
      before: { plan: before.plan, subscription_status: before.subscription_status },
      after: { plan: d.plan, subscription_status: d.subscription_status },
    });
    refresh(d.id);
    return { ok: true, message: "Plan saved" };
  });
}

/** Move a business to another Retexia customer (e.g. after the owner changed their login). */
export async function setPostOwner(input: { id: string; userId: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const d = z.object({ id: uuid, userId: uuid }).parse(input);
    const { data: p } = await createAdminClient().from("profiles").select("email").eq("id", d.userId).maybeSingle();
    if (!p) return { ok: false, message: "Customer not found." };
    const { error } = await post().from("businesses").update({ owner_id: d.userId, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) return { ok: false, message: error.message };
    await audit(staff, { action: "post.owner", table: "post.businesses", recordId: d.id, summary: `Moved Retexia Post business ${d.id} to ${p.email}` });
    refresh(d.id);
    return { ok: true, message: `Now owned by ${p.email}` };
  });
}

/** Account on/off (e.g. stop posting to one Page while the customer fixes it). */
export async function setPostAccountEnabled(input: { businessId: string; accountId: string; enabled: boolean }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("operate");
    const d = z.object({ businessId: uuid, accountId: uuid, enabled: z.boolean() }).parse(input);
    const { error } = await post().from("social_accounts").update({ enabled: d.enabled, updated_at: new Date().toISOString() }).eq("id", d.accountId).eq("business_id", d.businessId);
    if (error) return { ok: false, message: error.message };
    await audit(staff, { action: "post.account", table: "post.social_accounts", recordId: d.accountId, summary: `${d.enabled ? "Enabled" : "Disabled"} posting to account ${d.accountId}` });
    refresh(d.businessId);
    return { ok: true, message: d.enabled ? "Posting to this account" : "Not posting to this account" };
  });
}
