import "server-only";

/**
 * Paddle Billing (Merchant of Record) for the website: checkout transactions
 * and the customer billing portal. PADDLE_API_KEY stays on the server;
 * NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is Paddle's public client-side token.
 * Payments are recorded by the admin's webhook (admin.retexia.com/api/paddle/webhook).
 */

export type PaddleEnv = "sandbox" | "production";
export const paddleEnv = (): PaddleEnv => (process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox");
export const paddleReady = () => Boolean(process.env.PADDLE_API_KEY && process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN);
const base = () => (paddleEnv() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com");

type PaddleResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export async function paddleApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<PaddleResult<T>> {
  const key = process.env.PADDLE_API_KEY;
  if (!key) return { ok: false, error: "PADDLE_API_KEY is not set" };
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; detail?: string } };
    if (!res.ok || !json.data) return { ok: false, error: json.error?.detail ?? `Paddle replied ${res.status}`, code: json.error?.code };
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, error: "Paddle did not answer" };
  }
}
