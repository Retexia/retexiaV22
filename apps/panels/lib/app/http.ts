import "server-only";

import { z } from "zod";
import { AccessError, type ActionResult } from "../action";
import { appUser, type AppUser } from "./auth";

/**
 * Route handlers for the app: JSON in, JSON out, the person always from the access token.
 *   success  200 with the data (GET) or { message, data } (changes)
 *   failure  { error, fieldErrors? } with 400 (check the input), 401 (sign in again),
 *            403 (not on your account), 404, 429 or 500
 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function appRoute<C = unknown>(handler: (request: Request, user: AppUser, ctx: C) => Promise<Response | unknown>) {
  return async (request: Request, ctx: C): Promise<Response> => {
    try {
      const user = await appUser(request);
      if (!user) return json({ error: "Please sign in again." }, 401);
      const out = await handler(request, user, ctx);
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof AccessError) return json({ error: error.message }, 403);
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
        return json({ error: Object.values(fieldErrors)[0] ?? "Please check what you entered.", fieldErrors }, 400);
      }
      console.error("[app api]", error);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}

/** A shared operation's result (lib/…/ops.ts) as the app's answer. */
export function result<T>(r: ActionResult<T>) {
  if (!r.ok) return json({ error: r.message, ...(r.fieldErrors ? { fieldErrors: r.fieldErrors } : {}) }, 400);
  return json({ message: r.message ?? null, ...(r.data !== undefined ? { data: r.data } : {}) });
}

/** The request body as JSON (an empty or broken body is {}). Max 64 KB. */
export async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 65_536) throw new HttpError(413, "That's too much at once.");
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, "The request wasn't valid JSON.");
  }
}
