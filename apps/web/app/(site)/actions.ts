"use server";

import { createServerClient } from "@retexia/supabase/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { getT } from "@/lib/strings.server";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().trim().max(320),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  business_name: z.string().trim().max(200).optional().or(z.literal("")),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(5).max(5000),
  product_id: z.uuid().nullable().optional(),
  source_path: z.string().max(300).optional(),
  // Honeypot: real people never see or fill this field.
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function sendContactMessage(input: z.input<typeof contactSchema>): Promise<ActionResult> {
  const t = await getT();
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) {
      // Bot filled the honeypot: pretend it worked.
      return { ok: true, message: t("contact.success", "Thank you. We will reply within one working day.") };
    }
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fieldErrors[key] ??=
        key === "email"
          ? t("form.error.email", "Enter a valid email address")
          : key === "message"
            ? t("contact.error.message", "Tell us a little more (at least 5 characters)")
            : t("form.error.required", "Please fill this in");
    }
    return { ok: false, message: t("form.error.fix_fields", "Please check the highlighted fields"), fieldErrors };
  }
  if (!(await rateLimit("contact", 5))) {
    return { ok: false, message: t("form.error.rate_limited", "Too many messages. Please wait a few minutes and try again.") };
  }

  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const d = parsed.data;
  const { error } = await supabase.from("contact_messages").insert({
    name: d.name,
    email: d.email,
    phone: d.phone || null,
    business_name: d.business_name || null,
    subject: d.subject || null,
    message: d.message,
    product_id: d.product_id ?? null,
    source_path: d.source_path ?? null,
    user_id: auth.user?.id ?? null,
  });
  if (error) {
    console.error("[contact] insert failed:", error.message);
    return { ok: false, message: t("form.error.generic", "Something went wrong. Please try again, or message us on WhatsApp.") };
  }
  return { ok: true, message: t("contact.success", "Thank you. We will reply within one working day.") };
}

const waitlistSchema = z.object({
  product_id: z.uuid(),
  email: z.email().trim().max(320),
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function joinWaitlist(input: z.input<typeof waitlistSchema>): Promise<ActionResult> {
  const t = await getT();
  const parsed = waitlistSchema.safeParse(input);
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) {
      return { ok: true, message: t("waitlist.success", "You're on the list. We will email you when it opens.") };
    }
    return { ok: false, message: t("form.error.email", "Enter a valid email address"), fieldErrors: { email: t("form.error.email", "Enter a valid email address") } };
  }
  if (!(await rateLimit("waitlist", 10))) {
    return { ok: false, message: t("form.error.rate_limited", "Too many messages. Please wait a few minutes and try again.") };
  }
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("waitlist").insert({
    product_id: parsed.data.product_id,
    email: parsed.data.email.toLowerCase(),
    user_id: auth.user?.id ?? null,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: true, message: t("waitlist.already", "You're already on the list. We will email you when it opens.") };
    }
    console.error("[waitlist] insert failed:", error.message);
    return { ok: false, message: t("form.error.generic", "Something went wrong. Please try again, or message us on WhatsApp.") };
  }
  return { ok: true, message: t("waitlist.success", "You're on the list. We will email you when it opens.") };
}
