import { Alert, Button } from "@retexia/ui";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthSkeleton } from "@/components/auth/auth-skeleton";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/strings.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.reset.title", "Choose a new password"), robots: { index: false } };
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <ResetPassword />
    </Suspense>
  );
}

async function ResetPassword() {
  const [t, { user }] = await Promise.all([getT(), getUser()]);
  return (
    <AuthCard
      title={t("auth.reset.title", "Choose a new password")}
      subtitle={user?.email ? t("auth.reset.subtitle", "For {email}", { email: user.email }) : undefined}
    >
      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone="warning">{t("auth.reset.expired", "Your reset link has expired. Ask for a new one.")}</Alert>
          <Button href="/forgot-password" fullWidth>
            {t("auth.reset.request_new", "Send a new link")}
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
