"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, Textarea } from "@retexia/ui";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { sendContactMessage } from "@/app/(site)/actions";
import { useT } from "@/lib/strings-context";

export function ContactForm({ productId, sourcePath }: { productId: string | null; sourcePath: string }) {
  const t = useT();
  const [sent, setSent] = useState<string | null>(null);
  const schema = z.object({
    name: z.string().trim().min(1, t("form.error.required", "Please fill this in")).max(200),
    email: z.email(t("form.error.email", "Enter a valid email address")),
    phone: z.string().max(40).optional(),
    business_name: z.string().max(200).optional(),
    message: z.string().trim().min(5, t("contact.error.message", "Tell us a little more (at least 5 characters)")).max(5000),
    website: z.string().optional(),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", business_name: "", message: "", website: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await sendContactMessage({ ...values, product_id: productId, source_path: sourcePath });
    if (result.ok) {
      toast.success(result.message);
      setSent(result.message);
      form.reset();
    } else {
      for (const [key, message] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(key as keyof Values, { message });
      }
      toast.error(result.message);
    }
  });

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
          <CircleCheck aria-hidden size={24} strokeWidth={1.5} />
        </span>
        <h3 className="type-h2 text-ink">{t("contact.sent_title", "Message sent")}</h3>
        <p className="max-w-measure type-body text-ink-muted">{sent}</p>
        <Button variant="ghost" size="sm" onClick={() => setSent(null)}>
          {t("contact.send_another", "Send another message")}
        </Button>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={t("contact.name", "Your name")} required error={errors.name?.message}>
          <Input autoComplete="name" {...form.register("name")} />
        </Field>
        <Field label={t("contact.email", "Email")} required error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
        </Field>
        <Field label={t("contact.phone", "Phone")} optionalLabel={t("form.optional", "Optional")} error={errors.phone?.message}>
          <Input type="tel" autoComplete="tel" inputMode="tel" placeholder="+94 77 123 4567" {...form.register("phone")} />
        </Field>
        <Field label={t("contact.business", "Business name")} optionalLabel={t("form.optional", "Optional")} error={errors.business_name?.message}>
          <Input autoComplete="organization" {...form.register("business_name")} />
        </Field>
      </div>
      <Field label={t("contact.message", "How can we help?")} required error={errors.message?.message}>
        <Textarea rows={5} {...form.register("message")} />
      </Field>
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" {...form.register("website")} />
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="type-small text-ink-muted">{t("contact.reply_time", "We reply within one working day.")}</p>
        <Button type="submit" loading={isSubmitting}>
          {t("contact.submit", "Send message")}
        </Button>
      </div>
    </form>
  );
}
