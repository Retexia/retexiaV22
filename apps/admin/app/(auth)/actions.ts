"use server";

import { safeNext } from "@retexia/supabase";
import { createServerClient } from "@retexia/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action";
import { adminUrl } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : adminUrl();
}

export async function signIn(input: { email: string; password: string; next?: string | null }): Promise<ActionResult> {
  const parsed = z.object({ email: z.email(), password: z.string().min(1).max(72) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That email or password doesn't match." };
  if (!(await rateLimit("admin-sign-in", 8, 10 * 60 * 1000))) {
    return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  }
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      ok: false,
      message: error.code === "email_not_confirmed" ? "Please confirm your email first." : "That email or password doesn't match.",
    };
  }
  redirect(safeNext(input.next, "/"));
}

export async function sendMagicLink(input: { email: string; next?: string | null }): Promise<ActionResult> {
  const parsed = z.email().safeParse(input.email);
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  if (!(await rateLimit("admin-magic", 5, 10 * 60 * 1000))) {
    return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  }
  const supabase = await createServerClient();
  const next = safeNext(input.next, "/");
  await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  return { ok: true, message: "If this email belongs to the team, a sign-in link is on its way." };
}

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const parsed = z.email().safeParse(input.email);
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  if (!(await rateLimit("admin-reset", 5, 10 * 60 * 1000))) {
    return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  }
  const supabase = await createServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${await origin()}/auth/confirm?next=/reset-password` });
  return { ok: true, message: "If this email belongs to the team, a reset link is on its way." };
}

export async function setPassword(input: { password: string }): Promise<ActionResult> {
  const parsed = z
    .string()
    .min(10, "Use at least 10 characters")
    .regex(/[A-Za-z]/, "Use letters and numbers")
    .regex(/\d/, "Use letters and numbers")
    .safeParse(input.password);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Choose a stronger password." };
  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    return { ok: false, message: error.code === "same_password" ? "Choose a password you haven't used here." : "Could not save the password. Try again." };
  }
  redirect("/");
}
