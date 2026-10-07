import "server-only";

import { lingoDb } from "./db";

/**
 * Send a WhatsApp text from the business's own number through its Evolution
 * instance (same API the n8n bot uses). The API key is read here, on the
 * server, and never leaves it. The message is saved like a bot reply.
 */
export async function sendWhatsApp(tenantId: number, customerId: number, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = lingoDb();
  const [{ data: t }, { data: c }] = await Promise.all([
    db.from("lingo_users").select("evolution_base_url, evolution_instance, evolution_apikey").eq("id", tenantId).maybeSingle(),
    db.from("customers").select("id, remote_jid, number").eq("id", customerId).eq("lingo_user_id", tenantId).maybeSingle(),
  ]);
  if (!t || !c) return { ok: false, error: "Customer not found." };
  const number = c.remote_jid || c.number;
  if (!number) return { ok: false, error: "This customer has no WhatsApp number." };
  try {
    const res = await fetch(`${t.evolution_base_url.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(t.evolution_instance)}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: t.evolution_apikey },
      body: JSON.stringify({ number, text, linkPreview: false }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `WhatsApp is not reachable right now (${res.status}).` };
  } catch {
    return { ok: false, error: "WhatsApp is not reachable right now." };
  }
  await db.from("messages").insert({ lingo_user_id: tenantId, customer_id: customerId, role: "assistant", content: text, processed: true });
  return { ok: true };
}
