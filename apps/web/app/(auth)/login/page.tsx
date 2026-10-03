import { Alert } from "@retexia/ui";
import { safeNext } from "@retexia/supabase";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { setupNote } from "@/components/auth/auth-context";
import { AuthSkeleton } from "@/components/auth/auth-skeleton";
import { LoginForm } from "@/components/auth/login-form";
import { getSiteSettings } from "@/lib/content";
import { getT } from "@/lib/strings.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.login.title", "Sign in"), robots: { index: false } };
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const sp = await searchParams;
  const rawNext = typeof sp.next === "string" ? sp.next : null;
  const next = safeNext(rawNext);
  const [t, settings] = await Promise.all([getT(), getSiteSettings()]);
  const note = await setupNote(rawNext, t, "login");
  const nextQuery = next !== "/account" ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <AuthCard
      title={t("auth.login.title", "Sign in")}
      subtitle={note ?? t("auth.login.subtitle", "Welcome back. Sign in to see your products and requests.")}
      footer={
        <>
          {t("auth.login.no_account", "New to {site}?", { site: settings.site_name })}{" "}
          <Link href={`/signup${nextQuery}`} className="text-link hover:text-brand-hover">
            {t("auth.login.create_account", "Create an account")}
          </Link>
        </>
      }
    >
      {sp.error === "link" ? (
        <div className="mb-5">
          <Alert tone="warning">{t("auth.error.link_invalid", "That link has expired or was already used. Please try again.")}</Alert>
        </div>
      ) : null}
      <LoginForm next={next} magicLinkEnabled={settings.auth_magic_link_enabled} googleEnabled={settings.auth_google_enabled} />
    </AuthCard>
  );
}
