"use server";

import { createServerClient } from "@retexia/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/site-url";
import { getT } from "@/lib/strings.server";

export type AccountResult = { ok: true; message: string } | { ok: false; message: string };

const phone = z
  .string()
  .trim()
  .max(40)
  .refine((v) => v === "" || /^\+?[0-9][0-9\s().-]{6,19}$/.test(v));

const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone,
  whatsapp: phone,
  business_name: z.string().trim().max(200),
  marketing_opt_in: z.boolean(),
});

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<AccountResult> {
  const t = await getT();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("form.error.fix_fields", "Please check the highlighted fields") };
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: t("onboarding.error.signed_out", "Your session has ended. Please sign in again.") };
  const d = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: d.full_name,
      phone: d.phone || null,
      whatsapp: d.whatsapp || null,
      business_name: d.business_name || null,
      marketing_opt_in: d.marketing_opt_in,
    })
    .eq("id", auth.user.id);
  if (error) return { ok: false, message: t("form.error.generic", "Something went wrong. Please try again, or message us on WhatsApp.") };
  await supabase.auth.updateUser({ data: { full_name: d.full_name } });
  revalidatePath("/account", "layout");
  return { ok: true, message: t("account.profile.saved", "Your profile is saved.") };
}

export async function changeEmail(input: { email: string }): Promise<AccountResult> {
  const t = await getT();
  const parsed = z.email().trim().max(320).safeParse(input.email);
  if (!parsed.success) return { ok: false, message: t("form.error.email", "Enter a valid email address") };
  const supabase = await createServerClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${origin}/auth/confirm?next=/account/security` },
  );
  if (error) {
    return {
      ok: false,
      message:
        error.code === "email_exists"
          ? t("account.security.email_taken", "That email is already used by another account.")
          : t("auth.error.generic", "Something went wrong. Please try again."),
    };
  }
  return {
    ok: true,
    message: t("account.security.email_sent", "Check both your old and new inbox. Open the links we sent to confirm the change."),
  };
}

export async function changePassword(input: { password: string }): Promise<AccountResult> {
  const t = await getT();
  const parsed = z.string().min(8).max(72).safeParse(input.password);
  if (!parsed.success) return { ok: false, message: t("auth.error.password_short", "Use at least 8 characters") };
  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "same_password"
          ? t("auth.error.same_password", "Your new password must be different from the old one.")
          : error.code === "reauthentication_needed"
            ? t("account.security.reauth", "For your safety, sign out and sign in again, then change your password.")
            : t("auth.error.weak_password", "Choose a stronger password: at least 8 characters, with letters and numbers."),
    };
  }
  return { ok: true, message: t("account.password_updated", "Your password was updated.") };
}

export async function signOutEverywhere(): Promise<AccountResult> {
  const t = await getT();
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, message: t("auth.error.generic", "Something went wrong. Please try again.") };
  return { ok: true, message: t("account.security.signed_out", "You are signed out on every device.") };
}

export async function cancelOrder(input: { orderId: string; reason?: string }): Promise<AccountResult> {
  const t = await getT();
  const parsed = z.object({ orderId: z.uuid(), reason: z.string().max(500).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: t("form.error.generic", "Something went wrong. Please try again, or message us on WhatsApp.") };
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: parsed.data.orderId,
    p_reason: parsed.data.reason ?? "",
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "P0001"
          ? t("order.cancel.not_allowed", "This request can no longer be cancelled. Message us and we will help.")
          : t("form.error.generic", "Something went wrong. Please try again, or message us on WhatsApp."),
    };
  }
  revalidatePath("/account", "layout");
  return { ok: true, message: t("order.cancel.done", "Your request was cancelled.") };
}

const PROOF_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload a bank slip / transfer screenshot for a request that is awaiting
 * payment. Type and size are checked here and again by the storage bucket;
 * the file goes to the customer's own private folder.
 */
export async function submitPaymentProof(formData: FormData): Promise<AccountResult> {
  const t = await getT();
  const generic = t("form.error.generic", "Something went wrong. Please try again, or message us on WhatsApp.");
  if (!(await rateLimit("payment-proof", 10, 60 * 60 * 1000))) return { ok: false, message: t("order.proof.too_many", "Too many uploads. Please try again later.") };
  const parsed = z
    .object({ orderId: z.uuid(), reference: z.string().trim().max(200), note: z.string().trim().max(1000) })
    .safeParse({ orderId: formData.get("orderId"), reference: formData.get("reference") ?? "", note: formData.get("note") ?? "" });
  const file = formData.get("file");
  if (!parsed.success || !(file instanceof File)) return { ok: false, message: generic };
  const ext = PROOF_TYPES[file.type];
  if (!ext) return { ok: false, message: t("order.proof.type", "Upload a photo (JPG, PNG, WebP, HEIC) or a PDF.") };
  if (file.size > PROOF_MAX_BYTES) return { ok: false, message: t("order.proof.size", "The file must be 5 MB or smaller.") };

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: generic };
  const path = `${auth.user.id}/${parsed.data.orderId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("[payment proof] upload failed:", uploadError.message);
    return { ok: false, message: generic };
  }
  const { error } = await supabase.rpc("customer_submit_payment_proof", {
    p_order_id: parsed.data.orderId,
    p_proof_path: path,
    p_reference: parsed.data.reference,
    p_note: parsed.data.note,
  });
  if (error) {
    await supabase.storage.from("payment-proofs").remove([path]);
    return {
      ok: false,
      message: error.code === "P0001" ? t("order.proof.not_waiting", "This request is not waiting for a payment any more.") : generic,
    };
  }
  revalidatePath("/account", "layout");
  return { ok: true, message: t("order.proof.done", "Thank you. We will check your payment and confirm it soon.") };
}
