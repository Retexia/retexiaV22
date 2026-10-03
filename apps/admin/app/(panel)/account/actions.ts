"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const password = z.string().min(10, "Use at least 10 characters").max(200).regex(/[A-Za-z]/, "Use letters and numbers").regex(/\d/, "Use letters and numbers");

/** Signed-in staff (already past two-step sign-in) change their own password. */
export async function changePassword(input: { password: string; confirm: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("view");
    if (!(await rateLimit(`password:${staff.user.id}`, 5, 15 * 60_000))) return { ok: false, message: "Too many attempts. Try again in 15 minutes." };
    const d = z.object({ password, confirm: z.string() }).parse(input);
    if (d.password !== d.confirm) return { ok: false, message: "The passwords don't match.", fieldErrors: { confirm: "Doesn't match" } };
    const { error } = await staff.supabase.auth.updateUser({ password: d.password });
    if (error) return { ok: false, message: error.code === "same_password" ? "Choose a password you haven't used here." : error.message };
    await audit(staff, { action: "auth.password_changed", table: "profiles", recordId: staff.user.id, summary: "Changed own password" });
    return { ok: true, message: "Password changed" };
  });
}

export async function updateOwnProfile(input: { full_name: string; phone: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("view");
    const d = z.object({ full_name: z.string().trim().min(1).max(120), phone: z.string().trim().max(30) }).parse(input);
    const { error } = await staff.supabase.from("profiles").update({ full_name: d.full_name, phone: d.phone || null }).eq("id", staff.user.id);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved" };
  });
}

/** Audit MFA changes made in the browser (the Auth API call itself happens client-side). */
export async function logMfaChange(input: { change: "added" | "removed"; name: string }): Promise<void> {
  const staff = await requireRole("view");
  const d = z.object({ change: z.enum(["added", "removed"]), name: z.string().max(120) }).parse(input);
  await audit(staff, { action: `auth.mfa_${d.change}`, table: "profiles", recordId: staff.user.id, summary: `${d.change === "added" ? "Added" : "Removed"} authenticator “${d.name}”` });
}
