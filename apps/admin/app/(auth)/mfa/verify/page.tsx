import { safeNext } from "@retexia/supabase";
import { AuthCard } from "@/components/auth/auth-card";
import { MfaVerify, SignOutButton } from "@/components/auth/mfa";
import { param, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Two-step sign-in" };

export default async function MfaVerifyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const next = safeNext(param(await searchParams, "next"), "/");
  return (
    <AuthCard title="Two-step sign-in" subtitle="Enter the 6-digit code from your authenticator app." footer={<SignOutButton />}>
      <MfaVerify next={next} />
    </AuthCard>
  );
}
