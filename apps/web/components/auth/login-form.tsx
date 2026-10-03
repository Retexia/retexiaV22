"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Field, Input } from "@retexia/ui";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { sendMagicLink, signIn } from "@/app/(auth)/actions";
import { useT } from "@/lib/strings-context";
import { GoogleButton } from "./google-button";

export function LoginForm({
  next,
  magicLinkEnabled,
  googleEnabled,
}: {
  next: string;
  magicLinkEnabled: boolean;
  googleEnabled: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const schema = z.object({
    email: z.email(t("form.error.email", "Enter a valid email address")),
    password: mode === "password" ? z.string().min(1, t("auth.error.password_required", "Enter your password")) : z.string().optional(),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    if (mode === "magic") {
      const result = await sendMagicLink({ email: values.email, next });
      if (result.ok) setSent(result.message ?? "");
      else setError(result.message);
      return;
    }
    const result = await signIn({ email: values.email, password: values.password ?? "", next });
    if (result && !result.ok) setError(result.message);
  });

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title={t("auth.magic.sent_title", "Check your email")}>
          {sent}
        </Alert>
        <Button variant="ghost" onClick={() => setSent(null)}>
          {t("auth.magic.back", "Use a different email")}
        </Button>
      </div>
    );
  }

  const nextQuery = next !== "/account" ? `?next=${encodeURIComponent(next)}` : "";

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
        <Field label={t("auth.email", "Email")} required error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" autoFocus {...form.register("email")} />
        </Field>
        {mode === "password" ? (
          <Field
            label={t("auth.password", "Password")}
            required
            error={errors.password?.message}
          >
            <Input type="password" autoComplete="current-password" {...form.register("password")} />
          </Field>
        ) : null}
        {mode === "password" ? (
          <div className="-mt-2 flex justify-end">
            <Link href={`/forgot-password${nextQuery}`} className="rounded-sm type-small text-link hover:text-brand-hover focus-visible:focus-ring">
              {t("auth.login.forgot", "Forgot your password?")}
            </Link>
          </div>
        ) : null}
        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          {mode === "password" ? t("auth.login.submit", "Sign in") : t("auth.magic.submit", "Email me a sign-in link")}
        </Button>
        {magicLinkEnabled ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              form.clearErrors();
              setMode(mode === "password" ? "magic" : "password");
            }}
            className="self-center rounded-sm type-label text-link hover:text-brand-hover focus-visible:focus-ring"
          >
            {mode === "password"
              ? t("auth.magic.switch", "Email me a sign-in link instead")
              : t("auth.magic.switch_back", "Sign in with a password instead")}
          </button>
        ) : null}
      </form>
    </div>
  );
}
