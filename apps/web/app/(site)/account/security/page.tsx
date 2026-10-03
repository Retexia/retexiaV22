import { Alert } from "@retexia/ui";
import type { Metadata } from "next";
import { ChangeEmailForm, ChangePasswordForm, SignOutEverywhere } from "@/components/account/security-forms";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/strings.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.security.title", "Security") };
}

export default async function SecurityPage({ searchParams }: PageProps<"/account/security">) {
  const [{ user }, t, sp] = await Promise.all([requireUser("/account/security"), getT(), searchParams]);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="type-h1 text-ink">{t("account.security.title", "Security")}</h1>
        <p className="type-body-lg text-ink-muted">{t("account.security.subtitle", "Your sign-in details and devices.")}</p>
      </header>
      {sp.email_changed === "1" ? <Alert tone="success">{t("account.email_changed", "Your email address was updated.")}</Alert> : null}
      <ChangeEmailForm currentEmail={user.email ?? ""} />
      <ChangePasswordForm />
      <SignOutEverywhere />
    </div>
  );
}
