import "server-only";

/**
 * Your n8n "Retexia — Photo post (generate + publish)" workflow, called through
 * its webhook exactly as it is: { prompt, publish, business_id }. The workflow
 * writes the post (and, with publish = true, publishes it) in the database;
 * the panel reads the result from there.
 */
export type DesignRequest = { business_id: string; prompt: string; publish: boolean };

export const designConfigured = () => Boolean(process.env.N8N_PHOTO_POST_URL);

export async function requestDesign({ business_id, prompt, publish }: DesignRequest): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = process.env.N8N_PHOTO_POST_URL;
  if (!url) return { ok: false, error: "N8N_PHOTO_POST_URL is not set" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.N8N_POST_KEY ? { "x-retexia-key": process.env.N8N_POST_KEY } : {}) },
      body: JSON.stringify({ prompt, publish, business_id }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return res.ok ? { ok: true } : { ok: false, error: `n8n replied ${res.status}` };
  } catch {
    return { ok: false, error: "n8n did not answer" };
  }
}
