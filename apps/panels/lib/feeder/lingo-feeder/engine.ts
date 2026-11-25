import "server-only";

/**
 * Lingo Feeder's engine is the n8n workflow "Retexia — Lingo Feeder (WhatsApp bot)". The panel asks it,
 * on its "Panel: Lingo Feeder" webhook (LINGO_FEEDER_N8N_URL, header X-Retexia-Key = LINGO_FEEDER_N8N_KEY), to:
 *   test_bot  run one message through the real pipeline in test mode (nothing sent to WhatsApp)
 *   check     test the seller's number and token (Test connection)
 *   send      send the seller's own reply on their number
 *   flow_setup  create + publish the order form (WhatsApp Flow) in the seller's WABA
 * WhatsApp tokens never come here: n8n reads them from Supabase Vault. Never throws.
 */
export type EngineAction = "test_bot" | "check" | "send" | "flow_setup";

const env = (name: string) => process.env[`LINGO_FEEDER_${name}`]?.trim() || process.env[`FEEDER_LINGO_${name}`]?.trim() || "";
export const engineReady = () => Boolean(env("N8N_URL") && env("N8N_KEY"));

export async function engine<T = Record<string, unknown>>(
  action: EngineAction,
  userId: string,
  body: Record<string, unknown> = {},
  timeoutMs = 60_000,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const url = env("N8N_URL");
  const key = env("N8N_KEY");
  if (!url || !key) return { ok: false, error: "Lingo's engine isn't connected yet (LINGO_FEEDER_N8N_URL / LINGO_FEEDER_N8N_KEY)." };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-retexia-key": key },
      body: JSON.stringify({ ...body, action, user_id: userId }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "Lingo took too long to answer." : "Lingo's engine didn't answer. Try again in a minute." };
  }
  const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (res.status === 403) return { ok: false, error: "Lingo's engine refused the key (check LINGO_FEEDER_N8N_KEY)." };
  if (res.status === 404) return { ok: false, error: "Lingo's engine isn't switched on (activate the n8n workflow)." };
  if (!res.ok || !data) return { ok: false, error: `Lingo's engine answered ${res.status}.` };
  return { ok: true, data };
}

/** The WhatsApp Webhook's Production URL in n8n: sellers paste it in their Meta app. */
export const webhookUrl = () => env("WEBHOOK_URL") || null;
