import { safeNext } from "@retexia/supabase";
import { AuthCard } from "@/components/auth/auth-card";
import { MfaSetup, SignOutButton } from "@/components/auth/mfa";
import { param, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Set up two-step sign-in" };

export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const next = safeNext(param(await searchParams, "next"), "/");
  return (
    <AuthCard
      title="Set up two-step sign-in"
      subtitle="Every team account needs an authenticator app. It keeps customer data safe even if a password leaks."
      footer={<SignOutButton />}
    >
      <MfaSetup next={next} />
    </AuthCard>
  );
}
