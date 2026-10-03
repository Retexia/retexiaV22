"use server";

import type { Json, TablesUpdate } from "@retexia/supabase";
import { createServerClient } from "@retexia/supabase/server";
import { z } from "zod";
import { buildAnswers, parseForm, sanitizeValues, validateForm } from "@retexia/forms";
import { validationMessages } from "@retexia/forms";
import { getT } from "@/lib/strings.server";

export type SubmitOrderResult =
  | { ok: true; ref: string }
  | { ok: false; message: string; errors?: Record<string, string>; step?: number };

const inputSchema = z.object({
  pageSlug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  packageSlug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  cycle: z.enum(["monthly", "yearly"]),
  values: z.record(z.string(), z.unknown()),
  note: z.string().max(2000).optional(),
});

const PROFILE_FIELDS = {
  "profile.full_name": "full_name",
  "profile.phone": "phone",
  "profile.whatsapp": "whatsapp",
  "profile.business_name": "business_name",
} as const;

/**
 * Places an order from the onboarding form. Everything is re-checked here
 * against the database: the form definition, the package and the product.
 * Price, status and reference are set by the database trigger, never by us.
 */
export async function submitOrder(input: z.input<typeof inputSchema>): Promise<SubmitOrderResult> {
  const t = await getT();
  const generic = t("form.error.generic", "Something went wrong. Please try again, or message us on WhatsApp.");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: generic };
  const { pageSlug, packageSlug, cycle, values } = parsed.data;

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false, message: t("onboarding.error.signed_out", "Your session has ended. Please sign in again.") };

  const { data: product } = await supabase
    .from("products")
    .select("id, status, onboarding_form_id")
    .eq("page_slug", pageSlug)
    .eq("status", "live")
    .maybeSingle();
  if (!product?.onboarding_form_id) return { ok: false, message: t("onboarding.error.unavailable", "This product cannot be ordered right now.") };

  const { data: pkg } = await supabase
    .from("packages")
    .select("id, price_yearly, is_active")
    .eq("product_id", product.id)
    .eq("slug", packageSlug)
    .maybeSingle();
  if (!pkg?.is_active) return { ok: false, message: t("onboarding.error.package", "That package is not available. Please choose another.") };
  if (cycle === "yearly" && pkg.price_yearly === null) {
    return { ok: false, message: t("onboarding.error.cycle", "Yearly billing is not available for this package.") };
  }

  const { data: rawForm } = await supabase
    .from("forms")
    .select("*, steps:form_steps(*, fields:form_fields(*))")
    .eq("id", product.onboarding_form_id)
    .maybeSingle();
  if (!rawForm) return { ok: false, message: generic };
  const form = parseForm(rawForm);

  const result = validateForm(form, sanitizeValues(form, values), validationMessages(t));
  if (!result.ok) {
    return {
      ok: false,
      message: t("form.error.fix_fields", "Please check the highlighted fields"),
      errors: result.errors,
      step: result.firstInvalidStep,
    };
  }
  const answers = buildAnswers(form, result.values, { yes: t("common.yes", "Yes"), no: t("common.no", "No") });

  // Double-submit protection: an identical order in the last 60 seconds wins.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: recent } = await supabase
    .from("orders")
    .select("ref, answers")
    .eq("user_id", user.id)
    .eq("product_id", product.id)
    .eq("package_id", pkg.id)
    .eq("billing_cycle", cycle)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);
  const duplicate = recent?.find((o) => JSON.stringify(o.answers) === JSON.stringify(answers));
  if (duplicate?.ref) return { ok: true, ref: duplicate.ref };

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      product_id: product.id,
      package_id: pkg.id,
      billing_cycle: cycle,
      answers: answers as unknown as Json,
      form_id: form.id,
    })
    .select("ref")
    .single();
  if (error || !order?.ref) {
    console.error("[orders] insert failed:", error?.message);
    return { ok: false, message: generic };
  }

  // Fill empty profile fields from the answers (fields with prefill_from).
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, whatsapp, business_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profile) {
    const update: TablesUpdate<"profiles"> = {};
    for (const step of form.steps) {
      for (const field of step.fields) {
        const column = field.prefill_from ? PROFILE_FIELDS[field.prefill_from as keyof typeof PROFILE_FIELDS] : undefined;
        const value = result.values[field.key];
        if (column && typeof value === "string" && value && !profile[column] && !(column in update)) {
          update[column] = value;
        }
      }
    }
    if (Object.keys(update).length) await supabase.from("profiles").update(update).eq("id", user.id);
  }

  return { ok: true, ref: order.ref };
}
