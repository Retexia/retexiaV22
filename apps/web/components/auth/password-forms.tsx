"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Field, Input } from "@retexia/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { requestPasswordReset, updatePassword } from "@/app/(auth)/actions";
import { useT } from "@/lib/strings-context";

export function ForgotPasswordForm() {
  const t = useT();
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({ email: z.email(t("form.error.email", "Enter a valid email address")) });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setError(null);
    const result = await requestPasswordReset({ email });
    if (result.ok) setSent(result.message ?? "");
    else setError(result.message);
  });

  if (sent) {
    return (
      <Alert tone="success" title={t("auth.magic.sent_title", "Check your email")}>
        {sent}
      </Alert>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label={t("auth.email", "Email")} required error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" autoFocus {...form.register("email")} />
      </Field>
      <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting}>
        {t("auth.forgot.submit", "Send reset link")}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const schema = z
    .object({
      password: z
        .string()
        .min(8, t("auth.error.password_short", "Use at least 8 characters"))
        .max(72)
        .regex(/[A-Za-z]/, t("auth.error.password_letters", "Use letters and numbers"))
        .regex(/\d/, t("auth.error.password_letters", "Use letters and numbers")),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      path: ["confirm"],
      message: t("auth.error.password_mismatch", "The passwords don't match"),
    });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    const result = await updatePassword({ password });
    if (result && !result.ok) setError(result.message);
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field
        label={t("auth.new_password", "New password")}
        hint={t("auth.password_hint", "At least 8 characters, with letters and numbers.")}
        required
        error={errors.password?.message}
      >
        <Input type="password" autoComplete="new-password" autoFocus {...form.register("password")} />
      </Field>
      <Field label={t("auth.confirm_password", "Confirm password")} required error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
      </Field>
      <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
        {t("auth.reset.submit", "Save new password")}
      </Button>
    </form>
  );
}
