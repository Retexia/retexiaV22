"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, dbMessage, run, type ActionResult } from "@/lib/action";
import { lingoFeederActor } from "@/lib/feeder/lingo-feeder/data";
import { lfDb } from "@/lib/feeder/lingo-feeder/db";
import { engine } from "@/lib/feeder/lingo-feeder/engine";
import * as ops from "@/lib/feeder/lingo-feeder/ops";

const done = <T,>(message: string, data?: T): ActionResult<T> => {
  revalidatePath("/lingo-feeder", "layout");
  return { ok: true, message, data };
};
async function actor() {
  const a = await lingoFeederActor();
  if (!a) throw new AccessError("Lingo Feeder isn't on your account, or you were signed out. Please sign in again.");
  return a;
}

const text = (max: number) => z.string().trim().max(max, `Up to ${max} characters`);
const optText = (max: number) => text(max).transform((v) => v || null);
const localPhone = z.string().trim().transform((v) => v.replace(/[^\d+]/g, "")).refine((v) => v === "" || /^(\+?94|0)\d{9}$/.test(v), "Enter a Sri Lankan phone number (07X XXX XXXX)");

// ---------------------------------------------------------------------------
// Business details and Lingo on / off
// ---------------------------------------------------------------------------
const businessSchema = z.object({
  business_name: text(80).min(2, "Enter your shop's name"),
  phone: optText(40),
  location: optText(120),
  address: optText(300),
  delivery_days: z.string().trim().regex(/^\d{1,2}(-\d{1,2})?$/, 'Days like "3" or "2-3"'),
  call_hours: text(40).min(2, 'When you call customers back, e.g. "9am - 6pm"'),
  about: optText(300),
  ads_only: z.boolean(),
});
export async function saveBusiness(input: z.input<typeof businessSchema>) {
  return run(async () => {
    const { userId } = await actor();
    const d = businessSchema.parse(input);
    const { error } = await lfDb().from("sellers").update(d).eq("user_id", userId);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Saved. Lingo uses your details from the next message.");
  });
}

export async function setLingoOn(on: boolean) {
  return run(async () => {
    const { userId } = await actor();
    const r = await ops.setLingoOn(userId, Boolean(on));
    return r.ok ? done(r.message ?? "Saved.") : r;
  });
}

// ---------------------------------------------------------------------------
// WhatsApp number
// ---------------------------------------------------------------------------
const numberSchema = z.object({
  phone_number_id: z.string().trim().regex(/^\d{6,25}$/, "The Phone number ID is a long number (WhatsApp → API Setup)"),
  waba_id: z.string().trim().regex(/^(\d{6,25})?$/, "The WhatsApp Business Account ID is a long number").transform((v) => v || null),
  token: z.string().trim().max(1000).regex(/^(EA[A-Za-z0-9]{20,}|)$/, "That doesn't look like a permanent token (it starts with EA…)").transform((v) => v || null),
  app_secret: z.string().trim().max(200).regex(/^([a-f0-9]{32}|)$/i, "The App secret is 32 letters and numbers (App settings → Basic)").transform((v) => v || null),
});
export async function saveNumber(input: z.input<typeof numberSchema>) {
  return run(async () => {
    const { userId } = await actor();
    const d = numberSchema.parse(input);
    const { data, error } = await lfDb().rpc("save_number", { p: { user_id: userId, ...d } });
    if (error) return { ok: false, message: dbMessage(error) };
    const r = data as { ok: boolean; error?: string };
    if (!r.ok) {
      const msg: Record<string, string> = {
        taken: "This number is already connected to another Retexia account.",
        secrets: "Paste the permanent token and the App secret too (needed the first time).",
        phone_number_id: "Check the Phone number ID.",
        waba_id: "Check the WhatsApp Business Account ID.",
      };
      return { ok: false, message: msg[r.error ?? ""] ?? "Couldn't save the number." };
    }
    return done("Saved. Now press Test connection.");
  });
}

export async function checkNumber() {
  return run(async () => {
    const { userId } = await actor();
    const db = lfDb();
    const { data: n } = await db.from("numbers").select("phone_number_id").eq("user_id", userId).maybeSingle();
    if (!n) return { ok: false, message: "Save your number first." };
    const r = await engine<{ ok: boolean; error?: string | null; info?: Record<string, string> | null; subscribed?: boolean | null }>("check", userId, {}, 30_000);
    if (!r.ok) return { ok: false, message: r.error };
    const a = r.data;
    await db.rpc("bot_save_check", { p: { phone_number_id: n.phone_number_id, ok: a.ok, error: a.error ?? null, info: a.info ?? {} } });
    revalidatePath("/lingo-feeder", "layout");
    if (!a.ok) return { ok: false, message: `WhatsApp said: ${a.error ?? "no answer"}. Check the token and the Phone number ID.` };
    const extra = a.subscribed === false ? " One more step: your app isn't subscribed to this WhatsApp account yet (step 6)." : "";
    return { ok: true, message: `Connected: ${a.info?.verified_name || "your number"} ${a.info?.display_phone_number || ""}.${extra}`.replace(/\s+\./, ".") };
  });
}

export async function removeNumber() {
  return run(async () => {
    const { userId } = await actor();
    const { error } = await lfDb().rpc("remove_number", { p_user: userId });
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Number removed. Its token and App secret were deleted.");
  });
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------
export async function setChatStatus(input: { phone: string; status: string }) {
  return run(async () => {
    const { userId } = await actor();
    const r = await ops.setChatStatus(userId, input);
    return r.ok ? done(r.message ?? "Saved.") : r;
  });
}

export async function markCalled(input: { phone: string; called: boolean }) {
  return run(async () => {
    const { userId } = await actor();
    const r = await ops.markCalled(userId, input);
    return r.ok ? done(r.message ?? "Saved.") : r;
  });
}

export async function setChatPaused(input: { phone: string; paused: boolean }) {
  return run(async () => {
    const { userId } = await actor();
    const r = await ops.setChatPaused(userId, input);
    return r.ok ? done(r.message ?? "Saved.") : r;
  });
}

export async function replyToChat(input: { phone: string; text: string }) {
  return run(async () => {
    const { userId } = await actor();
    const r = await ops.replyToChat(userId, input);
    return r.ok ? done(r.message ?? "Sent.") : r;
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
const orderSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: text(80).min(2, "Enter the name"),
  address: text(300).min(5, "Enter the address"),
  phone1: localPhone.refine((v) => v !== "", "Enter a phone number"),
  phone2: localPhone,
  qty: z.coerce.number().int().min(1).max(20),
});
export async function saveOrder(input: z.input<typeof orderSchema>) {
  return run(async () => {
    const { userId } = await actor();
    const d = orderSchema.parse(input);
    const db = lfDb();
    const { data: o } = await db.from("orders").select("unit_price, delivery_fee, exported_at").eq("user_id", userId).eq("id", d.id).maybeSingle();
    if (!o) return { ok: false, message: "Order not found." };
    const { error } = await db.from("orders").update({
      name: d.name, address: d.address, phone1: d.phone1, phone2: d.phone2 || null, qty: d.qty,
      total: Number(o.unit_price) * d.qty + Number(o.delivery_fee ?? 0),
    }).eq("user_id", userId).eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(o.exported_at ? "Saved. It's already in a courier file: change it in Feeder too." : "Order saved.");
  });
}

export async function setOrderStatus(input: { id: number; status: "confirmed" | "cancelled" }) {
  return run(async () => {
    const { userId } = await actor();
    const r = await ops.setOrderStatus(userId, input);
    return r.ok ? done(r.message ?? "Saved.") : r;
  });
}

export async function setOrderSent(input: { id: number; sent: boolean }) {
  return run(async () => {
    const { userId } = await actor();
    const r = await ops.setOrderSent(userId, input);
    return r.ok ? done(r.message ?? "Saved.") : r;
  });
}

// ---------------------------------------------------------------------------
// Products and ads
// ---------------------------------------------------------------------------
export async function setProduct(input: { product_id: number; enabled: boolean; price: number | string | null }) {
  return run(async () => {
    const { userId } = await actor();
    const pid = z.coerce.number().int().positive().parse(input.product_id);
    const raw = input.price === "" || input.price == null ? null : Number(input.price);
    if (raw !== null && (!Number.isFinite(raw) || raw <= 0 || raw > 1_000_000)) return { ok: false, message: "Enter a price in rupees, or leave it empty for the Feeder price." };
    const { error } = await lfDb().from("seller_products").upsert({ user_id: userId, product_id: pid, enabled: Boolean(input.enabled), price: raw });
    if (error) return { ok: false, message: dbMessage(error) };
    return done(input.enabled ? "Saved." : "Lingo won't offer this product.");
  });
}

export async function setAdProduct(input: { ad_id: string; product_id: number | null }) {
  return run(async () => {
    const { userId } = await actor();
    const adId = text(300).min(1).parse(input.ad_id);
    const pid = input.product_id ? z.coerce.number().int().positive().parse(input.product_id) : null;
    const { error } = await lfDb().from("ads").update({ product_id: pid, matched_by: pid ? "seller" : null, tried: true }).eq("user_id", userId).eq("ad_id", adId);
    if (error) return { ok: false, message: dbMessage(error) };
    return done(pid ? "Saved: customers from this ad get this product." : "Cleared.");
  });
}

// ---------------------------------------------------------------------------
// Try Lingo (test chats, nothing goes to WhatsApp)
// ---------------------------------------------------------------------------
export type { TryReply } from "@/lib/feeder/lingo-feeder/ops";
export async function tryLingo(input: { text?: string; tap?: { id: string; title: string } | null; start_product?: number | null; name?: string }) {
  return run<ops.TryReply>(async () => {
    const { userId } = await actor();
    return ops.tryLingo(userId, input, "panel");
  });
}
export async function resetTry() {
  return run(async () => {
    const { userId } = await actor();
    return ops.resetTry(userId);
  });
}
