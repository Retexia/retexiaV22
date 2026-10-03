import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { getT } from "@/lib/strings.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.forgot.title", "Reset your password"), robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <AuthCard
      title={t("auth.forgot.title", "Reset your password")}
      subtitle={t("auth.forgot.subtitle", "Enter your email and we will send you a link to choose a new password.")}
      footer={
        <Link href="/login" className="text-link hover:text-brand-hover">
          {t("auth.forgot.back", "Back to sign in")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
