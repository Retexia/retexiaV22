import "server-only";

/**
 * The Lingo engine is the n8n workflow "Retexia — Feeder Lingo (WhatsApp bot)". The panel asks it,
 * on its "Panel: Lingo" webhook (FEEDER_LINGO_N8N_URL, header X-Retexia-Key = FEEDER_LINGO_N8N_KEY), to:
 *   test_bot  run one message through the real pipeline in test mode (nothing sent to WhatsApp)
 *   check     test the seller's number and token (Test connection)
 *   send      send the seller's Inbox reply on their number
 * WhatsApp tokens never come here: n8n reads them from Supabase Vault. Never throws.
 */
export type EngineAction = "test_bot" | "check" | "send";

export const engineReady = () => Boolean(process.env.FEEDER_LINGO_N8N_URL?.trim() && process.env.FEEDER_LINGO_N8N_KEY?.trim());

export async function engine<T = Record<string, unknown>>(
  action: EngineAction,
  sellerId: number,
  body: Record<string, unknown> = {},
  timeoutMs = 45_000,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const url = process.env.FEEDER_LINGO_N8N_URL?.trim();
  const key = process.env.FEEDER_LINGO_N8N_KEY?.trim();
  if (!url || !key) return { ok: false, error: "Lingo's engine isn't connected yet (FEEDER_LINGO_N8N_URL / FEEDER_LINGO_N8N_KEY)." };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-retexia-key": key },
      body: JSON.stringify({ ...body, action, lingo_user_id: sellerId }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "Lingo's engine took too long to answer." : "Lingo's engine didn't answer. Try again in a minute." };
  }
  const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (res.status === 403) return { ok: false, error: "Lingo's engine refused the key (check FEEDER_LINGO_N8N_KEY)." };
  if (res.status === 404) return { ok: false, error: "Lingo's engine isn't switched on (activate the n8n workflow)." };
  if (!res.ok || !data) return { ok: false, error: `Lingo's engine answered ${res.status}.` };
  return { ok: true, data };
}

/** The WhatsApp Webhook's Production URL in n8n: sellers paste it in their Meta app. */
export const webhookUrl = () => process.env.FEEDER_LINGO_WEBHOOK_URL?.trim() || null;
