"use server";

import { FIELD_TYPES } from "@retexia/forms";
import type { Json } from "@retexia/supabase";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { requireRole } from "@/lib/auth";
import { revalidateWebsite } from "@/lib/revalidate";

const uuid = z.uuid();
const optText = (max: number) => z.string().max(max).nullable().optional();

const field = z.object({
  id: uuid.optional(),
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "Lowercase letters, numbers and underscores").max(60),
  label: z.string().trim().min(1, "Every question needs a label").max(300),
  type: z.enum(FIELD_TYPES),
  placeholder: optText(200),
  help_text: optText(1000),
  options: z.array(z.object({ value: z.string().min(1).max(100), label: z.string().min(1).max(200), description: z.string().max(300).nullable().optional() })).max(60),
  required: z.boolean(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  default_value: optText(500),
  show_if: z
    .object({ field: z.string(), equals: z.union([z.string(), z.boolean()]).optional(), in: z.array(z.string()).optional(), not_in: z.array(z.string()).optional() })
    .nullable(),
  width: z.enum(["full", "half"]),
  prefill_from: z.enum(["profile.full_name", "profile.phone", "profile.whatsapp", "profile.business_name", "user.email"]).nullable(),
  is_visible: z.boolean(),
});

const formInput = z.object({
  id: uuid,
  title: z.string().trim().min(1).max(200),
  description: optText(1000),
  submit_label: optText(60),
  success_title: optText(200),
  success_message: optText(2000),
  steps: z
    .array(z.object({ id: uuid.optional(), title: z.string().trim().min(1, "Every step needs a title").max(120), description: optText(500), is_visible: z.boolean(), fields: z.array(field).max(80) }))
    .min(1)
    .max(20),
});

export type FormSaveInput = z.input<typeof formInput>;

/** Save the whole form in one transaction (admin_save_form bumps the version). */
export async function saveForm(input: FormSaveInput): Promise<ActionResult<number>> {
  return run(async () => {
    const { supabase } = await requireRole("manageProducts");
    const d = formInput.parse(input);
    for (const s of d.steps)
      for (const f of s.fields)
        if (["select", "radio", "radio_cards", "checkbox_group"].includes(f.type) && f.options.length < 2) {
          return { ok: false, message: `“${f.label}” needs at least two choices.` };
        }
    const { data, error } = await supabase.rpc("admin_save_form", { p: d as unknown as Json });
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/forms", "layout");
    revalidatePath("/products", "layout");
    const live = await revalidateWebsite("forms");
    return { ok: true, message: `Saved as version ${data}${live ? " · live on website" : ""}`, data: data ?? undefined };
  });
}

/** A blank form (one step, name + phone) to attach to a product. */
export async function createForm(input: { title: string; productId: string | null }): Promise<ActionResult<string>> {
  return run(async () => {
    const { supabase } = await requireRole("manageProducts");
    const d = z.object({ title: z.string().trim().min(2).max(200), productId: uuid.nullable() }).parse(input);
    const slug = `${d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "form"}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: form, error } = await supabase.from("forms").insert({ title: d.title, slug, product_id: d.productId }).select("id").single();
    if (error || !form) return { ok: false, message: dbMessage(error) };
    const { data: step, error: e2 } = await supabase.from("form_steps").insert({ form_id: form.id, title: "Your details", step_number: 1, sort_order: 1 }).select("id").single();
    if (e2 || !step) return { ok: false, message: dbMessage(e2) };
    const { error: e3 } = await supabase.from("form_fields").insert([
      { step_id: step.id, form_id: form.id, key: "full_name", label: "Your name", type: "text", required: true, prefill_from: "profile.full_name", width: "half", sort_order: 1 },
      { step_id: step.id, form_id: form.id, key: "phone", label: "Phone number", type: "phone", required: true, prefill_from: "profile.phone", width: "half", sort_order: 2 },
    ]);
    if (e3) return { ok: false, message: dbMessage(e3) };
    revalidatePath("/forms");
    return { ok: true, message: "Form created", data: form.id };
  });
}
