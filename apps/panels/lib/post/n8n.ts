import "server-only";

import type { CaptionLanguage, DesignLanguage } from "./languages";

/**
 * The n8n workflow "Retexia — Post" (n8n/retexia-post.json) is the worker: this
 * app decides what happens and when, n8n runs the job. One webhook, protected
 * with X-Retexia-Key = N8N_POST_KEY:
 *   plan:      writes prompts for a day's playlist and answers with them;
 *   design:    makes one post or story (captions + picture), saves it with
 *              post.finish_design(); answers at once, works in the background;
 *   publish:   posts a claimed post to the customer's Facebook / Instagram with
 *              the tokens stored in Supabase; answers at once, saves each result;
 *   delete:    deletes a published post from Facebook / Instagram (answers with results);
 *   edit_text: changes a published Facebook post's text (answers with results);
 *   whatsapp:  sends one WhatsApp message to an owner (Retexia's Evolution line).
 */
const url = () => process.env.N8N_POST_URL || "";
export const designConfigured = () => Boolean(url());

/**
 * Who talks to Facebook/Instagram and WhatsApp: the n8n worker (default) or,
 * with POST_PUBLISHER=panel, this app itself (fallback; same tokens from Supabase).
 */
export const panelPublishes = () => process.env.POST_PUBLISHER?.trim().toLowerCase() === "panel";

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
  /** What it is about: the AI only sees that product / group (or the whole business). */
  focus?: { type: "business" | "product" | "group"; id?: string; name?: string };
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

/** Hand a claimed post (status "publishing") to n8n. True when n8n accepted the job. */
export async function requestPublish(body: { post_id: string; business_id: string }): Promise<boolean> {
  if (!url()) return false;
  try {
    const res = await call({ action: "publish", ...body }, 15_000);
    return res.ok;
  } catch {
    return false;
  }
}

export type WorkerResult = { platform: string; ok: boolean; error: string | null };

/** Jobs n8n finishes before answering (delete from Meta, change Facebook text). */
async function syncJob(body: Record<string, unknown>): Promise<{ ok: true; results: WorkerResult[] } | { ok: false; error: string }> {
  if (!url()) return { ok: false, error: "The Post worker (n8n) is not connected yet." };
  try {
    const res = await call(body, 90_000);
    if (!res.ok) return { ok: false, error: `The Post worker replied ${res.status}. Try again in a minute.` };
    const json = (await res.json().catch(() => null)) as { results?: unknown } | null;
    const results = (Array.isArray(json?.results) ? json!.results : []) as Record<string, unknown>[];
    return { ok: true, results: results.map((r) => ({ platform: String(r.platform ?? "account"), ok: r.ok === true, error: r.error ? String(r.error).slice(0, 300) : null })) };
  } catch {
    return { ok: false, error: "The Post worker didn't answer. Try again in a minute." };
  }
}

export const requestDelete = (body: { post_id: string; business_id: string }) => syncJob({ action: "delete", ...body });
export const requestEditText = (body: { post_id: string; business_id: string; message: string }) => syncJob({ action: "edit_text", ...body });

/** One WhatsApp message to an owner, sent by n8n through Retexia's Evolution line. */
export async function requestWhatsApp(body: { business_id: string; number: string; text: string; image_url?: string }): Promise<boolean> {
  if (!url()) return false;
  try {
    const res = await call({ action: "whatsapp", ...body }, 45_000);
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return json?.ok === true;
  } catch {
    return false;
  }
}
