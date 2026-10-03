import { param, type SearchParams } from "@/lib/list-params";
import { AuthCard } from "@/components/auth/auth-card";
import { SetPasswordForm } from "@/components/auth/simple-forms";

export const metadata = { title: "Choose a password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const invited = param(await searchParams, "invited") === "1";
  return (
    <AuthCard
      title={invited ? "Welcome to the team" : "Choose a new password"}
      subtitle={invited ? "Choose a password. Next you will set up two-step sign-in." : undefined}
    >
      <SetPasswordForm />
    </AuthCard>
  );
}
