"use server";

import { createAdminClient, createAdminSchemaClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";

/** The request's customer (Retexia login) and ref. */
async function orderOwner(orderId: string) {
  const { data } = await createAdminClient().from("orders").select("id, ref, user_id").eq("id", orderId).maybeSingle();
  if (!data?.user_id) throw new Error("This request has no customer account, so it can't be linked.");
  return data as { id: string; ref: string; user_id: string };
}

const refresh = (ref: string) => revalidatePath(`/requests/${encodeURIComponent(ref)}`);

/** Connect an existing, unclaimed bot account to the request's customer. */
export async function linkLingoAccount(input: { orderId: string; accountId: number }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("operate");
    const d = z.object({ orderId: z.uuid(), accountId: z.number().int().positive() }).parse(input);
    const order = await orderOwner(d.orderId);
    const { data, error } = await createAdminSchemaClient("lingo")
      .from("lingo_users")
      .update({ owner_id: order.user_id, updated_at: new Date().toISOString() })
      .eq("id", d.accountId)
      .is("owner_id", null)
      .select("id, business_name");
    if (error) return { ok: false, message: error.message };
    if (!data?.length) return { ok: false, message: "That bot account is already connected to someone else." };
    await audit(staff, { action: "lingo.link", table: "lingo.lingo_users", recordId: String(d.accountId), summary: `Connected Lingo account #${d.accountId} (${data[0]?.business_name ?? ""}) to ${order.ref}` });
    refresh(order.ref);
    return { ok: true, message: "Connected. The customer's Lingo panel is ready." };
  });
}

/** Disconnect the customer's bot account (the bot keeps running). */
export async function unlinkLingoAccount(input: { orderId: string; accountId: number }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const d = z.object({ orderId: z.uuid(), accountId: z.number().int().positive() }).parse(input);
    const order = await orderOwner(d.orderId);
    const { error } = await createAdminSchemaClient("lingo").from("lingo_users").update({ owner_id: null }).eq("id", d.accountId).eq("owner_id", order.user_id);
    if (error) return { ok: false, message: error.message };
    await audit(staff, { action: "lingo.unlink", table: "lingo.lingo_users", recordId: String(d.accountId), summary: `Disconnected Lingo account #${d.accountId} from ${order.ref}` });
    refresh(order.ref);
    return { ok: true, message: "Disconnected" };
  });
}

const newAccount = z.object({
  orderId: z.uuid(),
  business_name: z.string().trim().min(2, "Enter the business name").max(120),
  evolution_instance: z.string().trim().min(1, "Enter the WhatsApp instance name").max(120),
  evolution_base_url: z.url({ protocol: /^https?$/, error: "Enter the Evolution API address, e.g. https://evo.example.com" }),
  evolution_apikey: z.string().trim().min(8, "Enter the instance API key").max(400),
  owner_phone: z.string().trim().max(20).regex(/^(\+?\d{9,15})?$/, "Digits only, with country code").transform((v) => v.replace(/^\+/, "") || null),
  default_language: z.enum(["si", "singlish", "en", "ta"]),
});

/** Create a bot account for this customer (their WhatsApp number on Evolution API). */
export async function createLingoAccount(input: z.input<typeof newAccount>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const { orderId, ...d } = newAccount.parse(input);
    const order = await orderOwner(orderId);
    const db = createAdminSchemaClient("lingo");
    const { data, error } = await db
      .from("lingo_users")
      .insert({ ...d, evolution_base_url: d.evolution_base_url.replace(/\/+$/, ""), content_language: d.default_language, owner_id: order.user_id })
      .select("id")
      .single();
    if (error) return { ok: false, message: error.code === "23505" ? "That WhatsApp instance already has a bot account. Connect it instead." : error.message };
    await db.from("business_details").insert({ lingo_user_id: data.id });
    await audit(staff, { action: "lingo.create", table: "lingo.lingo_users", recordId: String(data.id), summary: `Created Lingo account #${data.id} (${d.business_name}, ${d.evolution_instance}) for ${order.ref}` });
    refresh(order.ref);
    return { ok: true, message: "Bot account created and connected." };
  });
}
