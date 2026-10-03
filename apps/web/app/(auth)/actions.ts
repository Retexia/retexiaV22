"use server";

import { safeNext } from "@retexia/supabase";
import { createServerClient } from "@retexia/supabase/server";
import type { AuthError } from "@retexia/supabase";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Translate } from "@/lib/strings";
import { getT } from "@/lib/strings.server";
import { rateLimit } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/site-url";

export type AuthResult = { ok: true; message?: string } | { ok: false; message: string };

/** Friendly, editable messages for Supabase Auth errors. */
function authMessage(error: AuthError, t: Translate) {
  switch (error.code) {
    case "invalid_credentials":
      return t("auth.error.invalid_credentials", "That email or password doesn't match. Try again or reset your password.");
    case "email_not_confirmed":
      return t("auth.error.email_not_confirmed", "Please confirm your email first. Check your inbox for our link.");
    case "user_already_exists":
    case "email_exists":
      return t("auth.error.user_exists", "An account with this email already exists. Sign in instead.");
    case "weak_password":
      return t("auth.error.weak_password", "Choose a stronger password: at least 8 characters, with letters and numbers.");
    case "same_password":
      return t("auth.error.same_password", "Your new password must be different from the old one.");
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return t("auth.error.rate_limited", "Too many attempts. Please wait a minute and try again.");
    case "otp_expired":
      return t("auth.error.link_expired", "That link has expired. Ask for a new one.");
    case "signup_disabled":
      return t("auth.error.signup_disabled", "New sign-ups are paused right now. Please contact us.");
    default:
      return t("auth.error.generic", "Something went wrong. Please try again.");
  }
}

const email = z.email().trim().max(320);
const password = z.string().min(8).max(72);

export async function signIn(input: { email: string; password: string; next?: string | null }): Promise<AuthResult> {
  const t = await getT();
  const parsed = z.object({ email, password: z.string().min(1).max(72) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: t("auth.error.invalid_credentials", "That email or password doesn't match. Try again or reset your password.") };
  if (!(await rateLimit("sign-in", 10, 5 * 60 * 1000))) {
    return { ok: false, message: t("auth.error.rate_limited", "Too many attempts. Please wait a minute and try again.") };
  }
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, message: authMessage(error, t) };
  redirect(safeNext(input.next));
}

export async function sendMagicLink(input: { email: string; next?: string | null }): Promise<AuthResult> {
  const t = await getT();
  const parsed = email.safeParse(input.email);
  if (!parsed.success) return { ok: false, message: t("form.error.email", "Enter a valid email address") };
  const origin = await requestOrigin();
  const supabase = await createServerClient();
  const next = safeNext(input.next);
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return { ok: false, message: authMessage(error, t) };
  }
  // Same answer whether or not the email has an account (no account probing).
  return { ok: true, message: t("auth.magic.sent", "If that email has an account, a sign-in link is on its way. It works once and expires in an hour.") };
}

export async function signUp(input: {
  full_name: string;
  email: string;
  password: string;
  next?: string | null;
}): Promise<AuthResult & { needsConfirmation?: boolean }> {
  const t = await getT();
  const parsed = z
    .object({ full_name: z.string().trim().min(2).max(120), email, password })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: t("form.error.fix_fields", "Please check the highlighted fields") };
  if (!(await rateLimit("sign-up", 5, 10 * 60 * 1000))) {
    return { ok: false, message: t("auth.error.rate_limited", "Too many attempts. Please wait a minute and try again.") };
  }
  const origin = await requestOrigin();
  const next = safeNext(input.next);
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      // Keeps ?next through email confirmation (e.g. back to the onboarding form).
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { ok: false, message: authMessage(error, t) };
  // Email confirmation off → already signed in.
  if (data.session) redirect(next);
  // Supabase hides existing accounts by returning a user with no identities.
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, message: t("auth.error.user_exists", "An account with this email already exists. Sign in instead.") };
  }
  return { ok: true, needsConfirmation: true };
}

export async function requestPasswordReset(input: { email: string }): Promise<AuthResult> {
  const t = await getT();
  const parsed = email.safeParse(input.email);
  if (!parsed.success) return { ok: false, message: t("form.error.email", "Enter a valid email address") };
  if (!(await rateLimit("reset", 5, 10 * 60 * 1000))) {
    return { ok: false, message: t("auth.error.rate_limited", "Too many attempts. Please wait a minute and try again.") };
  }
  const origin = await requestOrigin();
  const supabase = await createServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });
  if (error && error.code === "over_email_send_rate_limit") return { ok: false, message: authMessage(error, t) };
  return { ok: true, message: t("auth.forgot.sent", "If that email has an account, we have sent a link to reset your password.") };
}

export async function updatePassword(input: { password: string }): Promise<AuthResult> {
  const t = await getT();
  const parsed = password.safeParse(input.password);
  if (!parsed.success) return { ok: false, message: t("auth.error.weak_password", "Choose a stronger password: at least 8 characters, with letters and numbers.") };
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: t("auth.reset.expired", "Your reset link has expired. Ask for a new one.") };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { ok: false, message: authMessage(error, t) };
  redirect("/account?password_updated=1");
}
