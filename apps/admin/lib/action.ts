import "server-only";

import { z } from "zod";
import { AccessError } from "./auth";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** Readable message from a Postgres/PostgREST error (our RPCs raise plain sentences). */
export function dbMessage(error: { message?: string; code?: string } | null | undefined, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  if (error.code === "23505") return "That already exists. Use a different value.";
  if (error.code === "23503") return "This is still used elsewhere, so it can't be removed.";
  if (error.code === "42501" && /row-level security|permission denied/i.test(error.message ?? "")) return "Your role can't do this.";
  if (error.code === "23514") return "One of the values is not allowed.";
  return error.message && error.message.length < 300 ? error.message : fallback;
}

/** Runs a server action body, turning thrown errors into a friendly result. */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) fieldErrors[String(issue.path.join("."))] ??= issue.message;
      return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
    }
    // Next.js redirect/notFound must propagate.
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[admin action]", error);
    return { ok: false, message: error instanceof Error && error.message.length < 300 ? error.message : "Something went wrong. Please try again." };
  }
}
