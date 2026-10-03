"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Avatar, Button, Checkbox, Field, Input } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { updateProfile } from "@/app/(site)/account/actions";
import { useT } from "@/lib/strings-context";

export function ProfileForm({
  initial,
}: {
  initial: { full_name: string; phone: string; whatsapp: string; business_name: string; marketing_opt_in: boolean };
}) {
  const t = useT();
  const router = useRouter();
  const phone = z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || /^\+?[0-9][0-9\s().-]{6,19}$/.test(v), t("form.error.phone", "Enter a valid phone number, like +94 77 123 4567"));
  const schema = z.object({
    full_name: z.string().trim().min(2, t("auth.error.name", "Enter your full name")).max(120),
    phone,
    whatsapp: phone,
    business_name: z.string().trim().max(200),
    marketing_opt_in: z.boolean(),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  const { errors, isSubmitting, isDirty } = form.formState;
  const name = useWatch({ control: form.control, name: "full_name" });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await updateProfile(values);
    if (result.ok) {
      toast.success(result.message);
      form.reset(values);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar name={name} size={56} />
        <p className="type-body text-ink-muted">{t("account.profile.avatar_hint", "Your initials are used as your avatar.")}</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={t("auth.full_name", "Full name")} required error={errors.full_name?.message} className="sm:col-span-2">
          <Input autoComplete="name" {...form.register("full_name")} />
        </Field>
        <Field label={t("contact.phone", "Phone")} optionalLabel={t("form.optional", "Optional")} error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+94 77 123 4567" {...form.register("phone")} />
        </Field>
        <Field
          label={t("account.profile.whatsapp", "WhatsApp number")}
          optionalLabel={t("form.optional", "Optional")}
          error={errors.whatsapp?.message}
        >
          <Input type="tel" inputMode="tel" placeholder="+94 77 123 4567" {...form.register("whatsapp")} />
        </Field>
        <Field
          label={t("contact.business", "Business name")}
          optionalLabel={t("form.optional", "Optional")}
          error={errors.business_name?.message}
          className="sm:col-span-2"
        >
          <Input autoComplete="organization" {...form.register("business_name")} />
        </Field>
      </div>
      <Checkbox
        {...form.register("marketing_opt_in")}
        label={t("account.profile.marketing", "Email me about new products and offers")}
        description={t("account.profile.marketing_hint", "A few emails a year. Unsubscribe any time.")}
      />
      <div className="flex justify-end border-t border-line pt-6">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          {t("account.profile.save", "Save changes")}
        </Button>
      </div>
    </form>
  );
}
