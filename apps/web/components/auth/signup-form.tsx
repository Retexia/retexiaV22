"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Field, Input } from "@retexia/ui";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { signUp } from "@/app/(auth)/actions";
import { useT } from "@/lib/strings-context";
import { GoogleButton } from "./google-button";

export function SignupForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const schema = z
    .object({
      full_name: z.string().trim().min(2, t("auth.error.name", "Enter your full name")).max(120),
      email: z.email(t("form.error.email", "Enter a valid email address")),
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
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ full_name, email, password }) => {
    setError(null);
    const result = await signUp({ full_name, email, password, next });
    if (!result) return;
    if (!result.ok) setError(result.message);
    else if (result.needsConfirmation) setSentTo(email);
  });

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <MailCheck aria-hidden size={24} strokeWidth={1.5} />
        </span>
        <h2 className="type-h2 text-ink">{t("auth.signup.check_email", "Check your email")}</h2>
        <p className="type-body text-ink-muted">
          {t("auth.signup.check_email_text", "We sent a confirmation link to {email}. Open it to finish creating your account.", { email: sentTo })}
        </p>
        <p className="type-small text-ink-muted">{t("auth.signup.spam_hint", "No email after a few minutes? Check your spam folder.")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {googleEnabled ? (
        <>
          <GoogleButton next={next} />
          <div className="flex items-center gap-3 type-small text-ink-muted">
            <span className="h-px flex-1 bg-line" />
            {t("auth.or", "or")}
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label={t("auth.full_name", "Full name")} required error={errors.full_name?.message}>
          <Input autoComplete="name" autoFocus {...form.register("full_name")} />
        </Field>
        <Field label={t("auth.email", "Email")} required error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
        </Field>
        <Field
          label={t("auth.password", "Password")}
          hint={t("auth.password_hint", "At least 8 characters, with letters and numbers.")}
          required
          error={errors.password?.message}
        >
          <Input type="password" autoComplete="new-password" {...form.register("password")} />
        </Field>
        <Field label={t("auth.confirm_password", "Confirm password")} required error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          {t("auth.signup.submit", "Create account")}
        </Button>
        <p className="text-center type-small text-ink-muted">
          {t("auth.signup.terms_prefix", "By creating an account you agree to our")}{" "}
          <Link href="/terms" className="text-link hover:text-brand-hover">
            {t("auth.signup.terms", "Terms")}
          </Link>{" "}
          {t("auth.signup.and", "and")}{" "}
          <Link href="/privacy" className="text-link hover:text-brand-hover">
            {t("auth.signup.privacy", "Privacy policy")}
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
