"use server";

import { createAdminClient, createAdminSchemaClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";

const accountId = z.number().int().positive();
const lang = z.enum(["si", "singlish", "en", "ta"]);
const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^(\+?\d{9,15})?$/, "Digits only, with country code, e.g. 94771234567")
  .transform((v) => v.replace(/^\+/, "") || null);

const lingo = () => createAdminSchemaClient("lingo");

function refresh(id?: number, ref?: string) {
  revalidatePath("/products/lingo");
  if (id) revalidatePath(`/products/lingo/accounts/${id}`);
  if (ref) revalidatePath(`/requests/${encodeURIComponent(ref)}`);
}

/** The request's customer (Retexia login) and ref. */
async function orderOwner(orderId: string) {
  const { data } = await createAdminClient().from("orders").select("id, ref, user_id").eq("id", orderId).maybeSingle();
  if (!data?.user_id) throw new Error("This request has no customer account, so it can't be linked.");
  return data as { id: string; ref: string; user_id: string };
}

async function customerLabel(userId: string) {
  const { data } = await createAdminClient().from("profiles").select("email, full_name").eq("id", userId).maybeSingle();
  return data?.email ?? data?.full_name ?? userId;
}

// ---------------------------------------------------------------------------
// Linking a bot account to a customer (their Retexia login)
// ---------------------------------------------------------------------------

/** Connect an existing, unclaimed bot account to the request's customer. */
export async function linkLingoAccount(input: { orderId: string; accountId: number }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("operate");
    const d = z.object({ orderId: z.uuid(), accountId }).parse(input);
    const order = await orderOwner(d.orderId);
    const { data, error } = await lingo()
      .from("lingo_users")
      .update({ owner_id: order.user_id, updated_at: new Date().toISOString() })
      .eq("id", d.accountId)
      .is("owner_id", null)
      .select("id, business_name");
    if (error) return { ok: false, message: error.message };
    if (!data?.length) return { ok: false, message: "That bot account is already connected to someone else." };
    await audit(staff, { action: "lingo.link", table: "lingo.lingo_users", recordId: String(d.accountId), summary: `Connected Lingo account #${d.accountId} (${data[0]?.business_name ?? ""}) to ${order.ref}` });
    refresh(d.accountId, order.ref);
    return { ok: true, message: "Connected. The customer's Lingo panel is ready." };
  });
}

/** Set or clear the owner of a bot account from its admin page. */
export async function setLingoOwner(input: { accountId: number; userId: string | null }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("operate");
    const d = z.object({ accountId, userId: z.uuid().nullable() }).parse(input);
    if (!d.userId) await requireRole("manageSettings");
    const { error } = await lingo().from("lingo_users").update({ owner_id: d.userId, updated_at: new Date().toISOString() }).eq("id", d.accountId);
    if (error) return { ok: false, message: error.message };
    const who = d.userId ? await customerLabel(d.userId) : null;
    await audit(staff, {
      action: d.userId ? "lingo.link" : "lingo.unlink",
      table: "lingo.lingo_users",
      recordId: String(d.accountId),
      summary: d.userId ? `Connected Lingo account #${d.accountId} to ${who}` : `Disconnected Lingo account #${d.accountId} from its customer`,
    });
    refresh(d.accountId);
    return { ok: true, message: d.userId ? `Connected to ${who}` : "Disconnected" };
  });
}

/** Disconnect the customer's bot account (the bot keeps running). */
export async function unlinkLingoAccount(input: { orderId: string; accountId: number }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const d = z.object({ orderId: z.uuid(), accountId }).parse(input);
    const order = await orderOwner(d.orderId);
    const { error } = await lingo().from("lingo_users").update({ owner_id: null }).eq("id", d.accountId).eq("owner_id", order.user_id);
    if (error) return { ok: false, message: error.message };
    await audit(staff, { action: "lingo.unlink", table: "lingo.lingo_users", recordId: String(d.accountId), summary: `Disconnected Lingo account #${d.accountId} from ${order.ref}` });
    refresh(d.accountId, order.ref);
    return { ok: true, message: "Disconnected" };
  });
}

// ---------------------------------------------------------------------------
// Creating and editing bot accounts
// ---------------------------------------------------------------------------

const newAccount = z.object({
  orderId: z.uuid().optional(),
  ownerId: z.uuid().nullable().optional(),
  business_name: z.string().trim().min(2, "Enter the business name").max(120),
  evolution_instance: z.string().trim().min(1, "Enter the WhatsApp instance name").max(120),
  evolution_base_url: z.url({ protocol: /^https?$/, error: "Enter the Evolution API address, e.g. https://evo.example.com" }),
  evolution_apikey: z.string().trim().min(8, "Enter the instance API key").max(400),
  owner_phone: phone,
  default_language: lang,
});

/** Create a bot account (their WhatsApp number on Evolution API), optionally for a customer. */
export async function createLingoAccount(input: z.input<typeof newAccount>): Promise<ActionResult<number>> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const { orderId, ownerId, ...d } = newAccount.parse(input);
    const order = orderId ? await orderOwner(orderId) : null;
    const owner = order?.user_id ?? ownerId ?? null;
    const db = lingo();
    const { data, error } = await db
      .from("lingo_users")
      .insert({ ...d, evolution_base_url: d.evolution_base_url.replace(/\/+$/, ""), content_language: d.default_language, owner_id: owner })
      .select("id")
      .single();
    if (error) return { ok: false, message: error.code === "23505" ? "That WhatsApp instance already has a bot account. Connect it instead." : error.message };
    await db.from("business_details").insert({ lingo_user_id: data.id });
    await audit(staff, {
      action: "lingo.create",
      table: "lingo.lingo_users",
      recordId: String(data.id),
      summary: `Created Lingo account #${data.id} (${d.business_name}, ${d.evolution_instance})${order ? ` for ${order.ref}` : ""}`,
    });
    refresh(data.id, order?.ref);
    return { ok: true, message: owner ? "Bot account created and connected." : "Bot account created.", data: data.id as number };
  });
}

const accountSettings = z.object({
  id: accountId,
  business_name: z.string().trim().min(2, "Enter the business name").max(120),
  staff_name: z.string().trim().max(60).transform((v) => v || null),
  owner_phone: phone,
  default_language: lang,
  content_language: lang,
  followup_hours: z.number().int().min(1).max(72),
  delivery_days: z.number().int().min(1).max(30),
});

export async function saveLingoAccount(input: z.input<typeof accountSettings>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("operate");
    const { id, ...d } = accountSettings.parse(input);
    const { error } = await lingo().from("lingo_users").update({ ...d, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { ok: false, message: error.message };
    await audit(staff, { action: "lingo.update", table: "lingo.lingo_users", recordId: String(id), summary: `Updated bot settings of Lingo account #${id}`, after: d });
    refresh(id);
    return { ok: true, message: "Saved. The bot uses it from the next message." };
  });
}

/** Turn a bot on or off (off: it reads nothing and answers nobody). */
export async function setLingoActive(input: { id: number; active: boolean }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("operate");
    const d = z.object({ id: accountId, active: z.boolean() }).parse(input);
    const { error } = await lingo().from("lingo_users").update({ active: d.active, updated_at: new Date().toISOString() }).eq("id", d.id);
    if (error) return { ok: false, message: error.message };
    await audit(staff, { action: d.active ? "lingo.on" : "lingo.off", table: "lingo.lingo_users", recordId: String(d.id), summary: `Turned Lingo account #${d.id} ${d.active ? "on" : "off"}` });
    refresh(d.id);
    return { ok: true, message: d.active ? "Bot is answering again" : "Bot is off" };
  });
}

const connection = z.object({
  id: accountId,
  evolution_instance: z.string().trim().min(1, "Enter the WhatsApp instance name").max(120),
  evolution_base_url: z.url({ protocol: /^https?$/, error: "Enter the Evolution API address" }),
  /** Empty: keep the current key. */
  evolution_apikey: z.string().trim().max(400),
});

/** WhatsApp connection (Evolution API). The key is write-only: never read back to the browser. */
export async function saveLingoConnection(input: z.input<typeof connection>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const d = connection.parse(input);
    if (d.evolution_apikey && d.evolution_apikey.length < 8) return { ok: false, message: "That API key looks too short." };
    const row: Record<string, string> = {
      evolution_instance: d.evolution_instance,
      evolution_base_url: d.evolution_base_url.replace(/\/+$/, ""),
      updated_at: new Date().toISOString(),
    };
    if (d.evolution_apikey) row.evolution_apikey = d.evolution_apikey;
    const { error } = await lingo().from("lingo_users").update(row).eq("id", d.id);
    if (error) return { ok: false, message: error.code === "23505" ? "Another bot account already uses that instance." : error.message };
    await audit(staff, {
      action: "lingo.connection",
      table: "lingo.lingo_users",
      recordId: String(d.id),
      summary: `Changed the WhatsApp connection of Lingo account #${d.id} (${d.evolution_instance}${d.evolution_apikey ? ", new API key" : ""})`,
    });
    refresh(d.id);
    return { ok: true, message: "Connection saved" };
  });
}

/** Ask Evolution API whether the WhatsApp number is connected. */
export async function checkLingoConnection(input: { id: number }): Promise<ActionResult<string>> {
  return run(async () => {
    await requireRole("operate");
    const id = accountId.parse(input.id);
    const { data } = await lingo().from("lingo_users").select("evolution_instance, evolution_base_url, evolution_apikey").eq("id", id).maybeSingle();
    if (!data) return { ok: false, message: "Bot account not found." };
    const res = await fetch(`${data.evolution_base_url}/instance/connectionState/${encodeURIComponent(data.evolution_instance)}`, {
      headers: { apikey: data.evolution_apikey },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    }).catch(() => null);
    if (!res) return { ok: false, message: "Evolution API did not answer. Check the address." };
    const json = (await res.json().catch(() => ({}))) as { instance?: { state?: string }; state?: string; message?: string };
    const state = json.instance?.state ?? json.state;
    if (!res.ok || !state) return { ok: false, message: `Evolution API replied ${res.status}${json.message ? `: ${json.message}` : ""}` };
    return { ok: true, message: state === "open" ? "WhatsApp is connected" : `WhatsApp state: ${state}`, data: state };
  });
}
