"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, Dialog, Field, Input } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { changeEmail, changePassword, signOutEverywhere } from "@/app/(site)/account/actions";
import { useT } from "@/lib/strings-context";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const t = useT();
  const schema = z.object({
    email: z
      .email(t("form.error.email", "Enter a valid email address"))
      .refine((v) => v.toLowerCase() !== currentEmail.toLowerCase(), t("account.security.same_email", "That is already your email address")),
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const onSubmit = form.handleSubmit(async ({ email }) => {
    const result = await changeEmail({ email });
    if (result.ok) {
      toast.success(result.message);
      form.reset();
    } else toast.error(result.message);
  });
  return (
    <Card as="section" aria-labelledby="email-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="email-title" className="type-h2 text-ink">
          {t("account.security.email_title", "Email address")}
        </h2>
        <p className="type-body text-ink-muted">
          {t("account.security.email_current", "You sign in with {email}.", { email: currentEmail })}
        </p>
      </div>
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Field label={t("account.security.new_email", "New email")} required error={form.formState.errors.email?.message} className="flex-1">
          <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
        </Field>
        <Button type="submit" variant="secondary" loading={form.formState.isSubmitting} className="sm:mt-7">
          {t("account.security.change_email", "Change email")}
        </Button>
      </form>
    </Card>
  );
}

export function ChangePasswordForm() {
  const t = useT();
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
    const result = await changePassword({ password });
    if (result.ok) {
      toast.success(result.message);
      form.reset();
    } else toast.error(result.message);
  });
  return (
    <Card as="section" aria-labelledby="password-title" className="flex flex-col gap-4">
      <h2 id="password-title" className="type-h2 text-ink">
        {t("account.security.password_title", "Password")}
      </h2>
      <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("auth.new_password", "New password")}
            hint={t("auth.password_hint", "At least 8 characters, with letters and numbers.")}
            required
            error={errors.password?.message}
          >
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field label={t("auth.confirm_password", "Confirm password")} required error={errors.confirm?.message} className="sm:pt-[26px]">
            <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" loading={isSubmitting}>
            {t("account.security.change_password", "Change password")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SignOutEverywhere() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <Card as="section" aria-labelledby="sessions-title" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 id="sessions-title" className="type-h2 text-ink">
          {t("account.security.sessions_title", "Devices")}
        </h2>
        <p className="type-body text-ink-muted">
          {t("account.security.sessions_text", "Signed in on a shared or lost device? Sign out everywhere, including here.")}
        </p>
      </div>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("account.security.sign_out_all", "Sign out everywhere")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={t("account.security.sign_out_all_title", "Sign out on every device?")}
        description={t("account.security.sign_out_all_text", "You will need to sign in again on each device, including this one.")}
        closeLabel={t("common.close", "Close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={async () => {
                setPending(true);
                const result = await signOutEverywhere();
                setPending(false);
                if (result.ok) {
                  toast.success(result.message);
                  router.push("/login");
                  router.refresh();
                } else toast.error(result.message);
              }}
            >
              {t("account.security.sign_out_all", "Sign out everywhere")}
            </Button>
          </>
        }
      />
    </Card>
  );
}
