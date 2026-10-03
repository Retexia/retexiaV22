import { Alert } from "@retexia/ui";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { param, type SearchParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return (
    <AuthCard title="Team sign in" subtitle="For the Retexia team. Customers sign in on retexia.com.">
      {param(sp, "error") === "link" ? (
        <div className="mb-5">
          <Alert tone="warning">That link has expired or was already used. Please try again.</Alert>
        </div>
      ) : null}
      <LoginForm next={param(sp, "next") ?? null} />
    </AuthCard>
  );
}
