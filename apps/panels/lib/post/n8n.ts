import "server-only";

import type { CaptionLanguage, DesignLanguage } from "./languages";

/**
 * The n8n workflow "Retexia — Post (plan + design)" (n8n/retexia-post.json):
 * one webhook, two jobs, protected with X-Retexia-Key = N8N_POST_KEY.
 *   plan:   writes prompts for a day's playlist and answers with them;
 *   design: makes one post or story (captions + picture) and saves it with
 *           post.finish_design(); answers at once and works in the background.
 */
const url = () => process.env.N8N_POST_URL || "";
export const designConfigured = () => Boolean(url());

async function call(body: Record<string, unknown>, timeoutMs: number) {
  const res = await fetch(url(), {
    method: "POST",
    headers: { "content-type": "application/json", ...(process.env.N8N_POST_KEY ? { "x-retexia-key": process.env.N8N_POST_KEY } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  return res;
}

export type PlanSlot = { key: string; format: "post" | "story"; time: string; hint: string | null };
export type PlannedPrompt = { key: string; title: string; prompt: string; angle: string; product: string };

/** Prompts for a day's playlist (one AI call). Null when n8n isn't reachable; the caller falls back. */
export async function requestPlan(body: {
  business_id: string;
  date: string;
  caption_language: CaptionLanguage;
  design_language: DesignLanguage;
  prompt_language: "si" | "en" | "ta";
  slots: PlanSlot[];
}): Promise<PlannedPrompt[] | null> {
  if (!url() || !body.slots.length) return null;
  try {
    const res = await call({ action: "plan", ...body }, 110_000);
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { items?: unknown } | null;
    const items = Array.isArray(json?.items) ? (json!.items as Record<string, unknown>[]) : [];
    return items
      .map((i) => ({ key: String(i.key ?? ""), title: String(i.title ?? "").slice(0, 120), prompt: String(i.prompt ?? "").slice(0, 1500), angle: String(i.angle ?? "").slice(0, 60), product: String(i.product ?? "").slice(0, 120) }))
      .filter((i) => i.key && i.prompt.length >= 3);
  } catch {
    return null;
  }
}

export type DesignRequest = {
  business_id: string;
  /** A playlist item to design; omit for a post made by hand (saved as a new post). */
  post_id?: string;
  prompt: string;
  format: "post" | "story";
  caption_language: CaptionLanguage;
  design_language: DesignLanguage;
  /** true: publish as soon as it is ready. */
  publish: boolean;
  /** Posts made by hand: when to publish (ISO); default in an hour. */
  scheduled_at?: string;
};

export async function requestDesign(body: DesignRequest): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!url()) return { ok: false, error: "N8N_POST_URL is not set" };
  try {
    const res = await call({ action: "design", ...body }, 15_000);
    return res.ok ? { ok: true } : { ok: false, error: `n8n replied ${res.status}` };
  } catch {
    return { ok: false, error: "n8n did not answer" };
  }
}
