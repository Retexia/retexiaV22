import "server-only";

/**
 * The n8n workflow "Retexia — Plan" (n8n/retexia-plan.json): the AI coach
 * (OpenRouter), the morning WhatsApp message (Evolution) and the weekly
 * summary. One webhook, X-Retexia-Key = PLAN_N8N_KEY.
 */
const url = () => process.env.PLAN_N8N_URL?.trim() || "";
export const planWorkerReady = () => Boolean(url());

export async function planWorker<T extends Record<string, unknown>>(action: "coach" | "morning" | "weekly" | "whatsapp", body: Record<string, unknown>, timeoutMs = 60_000): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  if (!url()) return { ok: false, error: "The Plan worker (n8n) is not connected: PLAN_N8N_URL is not set." };
  try {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "content-type": "application/json", "x-retexia-key": process.env.PLAN_N8N_KEY?.trim() ?? "" },
      body: JSON.stringify({ action, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
    if (!res.ok || !json) return { ok: false, error: `The Plan worker replied ${res.status}.` };
    if (json.ok === false) return { ok: false, error: String(json.error ?? "The Plan worker could not do it.").slice(0, 300) };
    return { ...json, ok: true } as { ok: true } & T;
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "The Plan worker didn't answer in time." : "Couldn't reach the Plan worker (n8n)." };
  }
}
