import "server-only";

import { z } from "zod";

export type ActionResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; message: string; fieldErrors?: Record<string, string> };

export class AccessError extends Error {}

/** Runs a server action body and turns thrown errors into a friendly result. */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
    }
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[post action]", error);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export function dbMessage(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return "Something went wrong. Please try again.";
  if (error.code === "23505") return "That already exists.";
  return error.message && error.message.length < 200 ? error.message : "Something went wrong. Please try again.";
}
