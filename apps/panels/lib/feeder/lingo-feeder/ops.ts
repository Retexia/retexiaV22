import "server-only";

import type { LfTryReply } from "@retexia/shared/app-api";
import { z } from "zod";
import { dbMessage, type ActionResult } from "../../action";
import { lfDb } from "./db";
import { engine } from "./engine";
import { SET_STATUSES, windowOpen } from "./labels";

/**
 * What a Lingo Feeder seller can do, shared by the web panel's server actions
 * (app/feeder/(app)/lingo-feeder/actions.ts) and the app's /api/app/lingo-feeder routes. userId
 * always comes from the session or the access token (lingoFeederActor / appLingoFeeder), never
 * from the request body. Inputs are validated here, so both callers get the same rules.
 */

const event = (userId: string, type: string, detail: Record<string, unknown>, phone: string | null = null) =>
  lfDb().from("events").insert({ user_id: userId, phone, type, detail });

export const text = (max: number) => z.string().trim().max(max, `Up to ${max} characters`);
export const phoneKey = z.string().regex(/^\d{6,20}$/, "Unknown chat");

// ---------------------------------------------------------------------------
// Lingo on / off
// ---------------------------------------------------------------------------
export async function setLingoOn(userId: string, on: boolean): Promise<ActionResult> {
  const db = lfDb();
  const { data: s } = await db.from("sellers").select("status, business_name, phone").eq("user_id", userId).single();
  if (s?.status === "blocked") return { ok: false, message: "Lingo is on hold for your account. Please contact Retexia." };
  if (on) {
    if (!s?.business_name || s.business_name === "My shop") return { ok: false, message: "Add your shop's name first (Business details)." };
    const { data: n } = await db.from("numbers").select("status").eq("user_id", userId).maybeSingle();
    if (!n) return { ok: false, message: "Connect your WhatsApp number first (WhatsApp tab)." };
    if (n.status !== "connected") return { ok: false, message: "Press Test connection on the WhatsApp tab first; Lingo turns on once your number answers." };
  }
  const { error } = await db.from("sellers").update({ status: on ? "live" : "paused" }).eq("user_id", userId);
  if (error) return { ok: false, message: dbMessage(error) };
  await event(userId, on ? "lingo_on" : "lingo_off", {});
  return { ok: true, message: on ? "Lingo is on. She answers new messages on your WhatsApp." : "Lingo is off. New messages wait in Chats for you." };
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------
export async function setChatStatus(userId: string, input: { phone: string; status: string }): Promise<ActionResult> {
  const phone = phoneKey.parse(input.phone);
  const status = z.enum(SET_STATUSES).parse(input.status);
  const { error } = await lfDb().from("chats").update({ status, status_at: new Date().toISOString() }).eq("user_id", userId).eq("phone", phone);
  if (error) return { ok: false, message: dbMessage(error) };
  return { ok: true, message: "Status changed." };
}

export async function markCalled(userId: string, input: { phone: string; called: boolean }): Promise<ActionResult> {
  const phone = phoneKey.parse(input.phone);
  const called = z.boolean().parse(input.called);
  const { error } = await lfDb().from("chats").update(called ? { needs_call: false } : { needs_call: true, call_reason: "Marked by you" }).eq("user_id", userId).eq("phone", phone);
  if (error) return { ok: false, message: dbMessage(error) };
  await event(userId, called ? "called" : "call_marked", {}, phone);
  return { ok: true, message: called ? "Marked as called." : "Added to Call them." };
}

export async function setChatPaused(userId: string, input: { phone: string; paused: boolean }): Promise<ActionResult> {
  const phone = phoneKey.parse(input.phone);
  const paused = z.boolean().parse(input.paused);
  const until = paused ? new Date(Date.now() + 365 * 86400_000).toISOString() : null;
  const { error } = await lfDb().from("chats").update({ paused_until: until, unsure: 0 }).eq("user_id", userId).eq("phone", phone);
  if (error) return { ok: false, message: dbMessage(error) };
  return { ok: true, message: paused ? "Lingo is paused in this chat. You answer it." : "Lingo answers this chat again from the next message." };
}

export async function replyToChat(userId: string, input: { phone: string; text: string }): Promise<ActionResult> {
  const phone = phoneKey.parse(input.phone);
  const body = text(4000).min(1, "Write a message").parse(input.text);
  const db = lfDb();
  const { data: c } = await db.from("chats").select("last_in_at").eq("user_id", userId).eq("phone", phone).eq("test", false).maybeSingle();
  if (!c) return { ok: false, message: "This chat doesn't exist." };
  if (!windowOpen(c.last_in_at)) return { ok: false, message: "WhatsApp only allows a free reply within 24 hours of the customer's last message. Call them instead." };
  const r = await engine<{ ok: boolean; wa_id?: string | null; error?: string | null }>("send", userId, { to: phone, text: body });
  if (!r.ok) return { ok: false, message: r.error };
  if (!r.data.ok) return { ok: false, message: `WhatsApp didn't send it: ${r.data.error ?? "unknown error"}` };
  const now = new Date();
  await db.from("messages").insert({ user_id: userId, phone, role: "s", content: body, wa_id: r.data.wa_id, status: "sent", route: "human" });
  await db.from("chats").update({ paused_until: new Date(now.getTime() + 12 * 3600_000).toISOString(), last_msg_at: now.toISOString(), last_out_at: now.toISOString() }).eq("user_id", userId).eq("phone", phone);
  return { ok: true, message: "Sent. Lingo stays quiet in this chat for 12 hours (or press Let Lingo answer)." };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
const orderId = z.coerce.number().int().positive();

export async function setOrderStatus(userId: string, input: { id: number | string; status: "confirmed" | "cancelled" }): Promise<ActionResult> {
  const id = orderId.parse(input.id);
  const status = z.enum(["confirmed", "cancelled"]).parse(input.status);
  const now = new Date().toISOString();
  const { error } = await lfDb().from("orders")
    .update(status === "cancelled" ? { status, cancelled_at: now } : { status, cancelled_at: null })
    .eq("user_id", userId).eq("id", id).neq("status", "draft");
  if (error) return { ok: false, message: dbMessage(error) };
  return { ok: true, message: status === "cancelled" ? "Order cancelled." : "Order back on." };
}

export async function setOrderSent(userId: string, input: { id: number | string; sent: boolean }): Promise<ActionResult> {
  const id = orderId.parse(input.id);
  const sent = z.boolean().parse(input.sent);
  const { error } = await lfDb().from("orders").update({ exported_at: sent ? new Date().toISOString() : null }).eq("user_id", userId).eq("id", id).eq("status", "confirmed");
  if (error) return { ok: false, message: dbMessage(error) };
  return { ok: true, message: sent ? "Marked as sent to Feeder." : "Back in the next courier file." };
}

// ---------------------------------------------------------------------------
// Try Lingo (test chats, nothing goes to WhatsApp)
// ---------------------------------------------------------------------------
export type TryReply = LfTryReply;
const tapSchema = z.object({ id: z.string().trim().min(1).max(200), title: z.string().trim().max(200) }).nullable().optional();

export async function tryLingo(
  userId: string,
  input: { text?: string; tap?: { id: string; title: string } | null; start_product?: number | null; name?: string },
  session: "panel" | "app" = "panel",
): Promise<ActionResult<TryReply>> {
  const t = String(input.text ?? "").trim().slice(0, 1500);
  const tap = tapSchema.parse(input.tap ?? null) ?? null;
  const start = input.start_product == null ? null : orderId.parse(input.start_product);
  const name = String(input.name ?? "").trim().slice(0, 60);
  if (!t && !tap) return { ok: false, message: "Type a message." };
  const { count } = await lfDb().from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId).like("phone", "test-%").eq("role", "c")
    .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
  if ((count ?? 0) >= 150) return { ok: false, message: "That's a lot of test messages today. Try again tomorrow." };
  const r = await engine<TryReply>("test_bot", userId, { session, text: t, tap, start_product: start, name });
  if (!r.ok) return { ok: false, message: r.error };
  return { ok: true, data: r.data };
}

export async function resetTry(userId: string): Promise<ActionResult> {
  const { error } = await lfDb().from("chats").delete().eq("user_id", userId).eq("test", true);
  if (error) return { ok: false, message: dbMessage(error) };
  return { ok: true, message: "New test chat." };
}
