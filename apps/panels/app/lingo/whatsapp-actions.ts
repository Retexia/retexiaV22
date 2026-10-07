"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, dbMessage, run, type ActionResult } from "@/lib/action";
import { connectCode, connectionState, createInstance, evolutionConfig, instanceNameFor, lingoWebhookUrl, logout, setWebhook, type WaState } from "@/lib/lingo/evolution";
import { lingoDb } from "@/lib/lingo/db";
import { lingoCustomer, requireLingo } from "@/lib/lingo/session";

const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^(\+?\d{9,15})?$/, "Digits only, with country code, e.g. 94771234567")
  .transform((v) => v.replace(/^\+/, ""));

/** The bot's Evolution instance and its key (server-side only, never returned). */
async function connection(tenantId: number) {
  const { data } = await lingoDb().from("lingo_users").select("evolution_base_url, evolution_instance, evolution_apikey").eq("id", tenantId).maybeSingle();
  if (!data) throw new AccessError("Your Lingo account was not found.");
  return { base: data.evolution_base_url, instance: data.evolution_instance, apikey: data.evolution_apikey };
}

// ---------------------------------------------------------------------------
// First-time setup: create the bot and its WhatsApp line
// ---------------------------------------------------------------------------

const setupInput = z.object({
  business_name: z.string().trim().min(2, "Enter your business name").max(120),
  owner_phone: phone,
  default_language: z.enum(["si", "singlish", "en", "ta"]),
});

/**
 * Creates the customer's Lingo bot: a WhatsApp line on Retexia's Evolution
 * server (sending messages to the n8n bot) and the bot account in the
 * database, owned by this customer. Next step: scan the QR code.
 */
export async function startLingoSetup(input: z.input<typeof setupInput>): Promise<ActionResult> {
  return run(async () => {
    const customer = await lingoCustomer();
    if (!customer) throw new AccessError("Please sign in again.");
    if (!customer.order) throw new AccessError("Lingo is not active on your account.");
    const cfg = evolutionConfig();
    if (!cfg) return { ok: false, message: "Self-setup isn't available yet. The Retexia team will connect your WhatsApp for you." };
    if (!cfg.webhook) return { ok: false, message: "Lingo isn't fully set up on our side yet. Please message Retexia." };
    const d = setupInput.parse(input);
    const db = lingoDb();
    const { data: existing } = await db.from("lingo_users").select("id").eq("owner_id", customer.id).limit(1);
    if (existing?.length) return { ok: true, message: "Your bot already exists." };

    const instance = instanceNameFor(d.business_name);
    const created = await createInstance(cfg, instance);
    if (!created.ok) return { ok: false, message: `We couldn't create your WhatsApp line: ${created.error}` };
    const { data, error } = await db
      .from("lingo_users")
      .insert({
        owner_id: customer.id,
        business_name: d.business_name,
        evolution_instance: instance,
        evolution_base_url: cfg.url,
        evolution_apikey: created.apikey,
        owner_phone: d.owner_phone || null,
        default_language: d.default_language,
        content_language: d.default_language,
        active: true,
      })
      .select("id")
      .single();
    if (error) return { ok: false, message: dbMessage(error) };
    await db.from("business_details").insert({ lingo_user_id: data.id, contact_phone: d.owner_phone || null });
    revalidatePath("/", "layout");
    return { ok: true, message: "Your bot is ready. Now connect your WhatsApp." };
  });
}

// ---------------------------------------------------------------------------
// Linking the phone (QR code or pairing code), status, unlinking
// ---------------------------------------------------------------------------

export type ConnectCode = { qr: string | null; pairingCode: string | null; state: WaState };

/** A fresh QR code (or, with a phone number, an 8-character pairing code). */
export async function getWhatsAppCode(input: { phone?: string } = {}): Promise<ActionResult<ConnectCode>> {
  return run(async () => {
    const { tenant } = await requireLingo();
    const number = input.phone ? phone.parse(input.phone) : undefined;
    const c = await connection(tenant.id);
    // Make sure messages reach the bot before the phone is linked.
    const hook = lingoWebhookUrl();
    if (hook) await setWebhook(c.base, c.instance, c.apikey, hook);
    const r = await connectCode(c.base, c.instance, c.apikey, number || undefined);
    if (!r.ok) return { ok: false, message: `WhatsApp server: ${r.error}` };
    return { ok: true, data: { qr: r.qr, pairingCode: r.pairingCode, state: r.state } };
  });
}

export async function getWhatsAppState(): Promise<ActionResult<WaState>> {
  return run(async () => {
    const { tenant } = await requireLingo();
    const c = await connection(tenant.id);
    return { ok: true, data: await connectionState(c.base, c.instance, c.apikey) };
  });
}

/** Unlink this phone from Lingo (the bot stops until a phone is linked again). */
export async function disconnectWhatsApp(): Promise<ActionResult> {
  return run(async () => {
    const { tenant } = await requireLingo();
    const c = await connection(tenant.id);
    const ok = await logout(c.base, c.instance, c.apikey);
    revalidatePath("/", "layout");
    return ok ? { ok: true, message: "WhatsApp unlinked. Scan the code again to reconnect." } : { ok: false, message: "The WhatsApp server didn't answer. Try again in a minute." };
  });
}
