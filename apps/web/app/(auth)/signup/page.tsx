import { safeNext } from "@retexia/supabase";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { setupNote } from "@/components/auth/auth-context";
import { AuthSkeleton } from "@/components/auth/auth-skeleton";
import { SignupForm } from "@/components/auth/signup-form";
import { getSiteSettings } from "@/lib/content";
import { getT } from "@/lib/strings.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.signup.title", "Create your account"), robots: { index: false } };
}

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <Signup searchParams={searchParams} />
    </Suspense>
  );
}

async function Signup({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const sp = await searchParams;
  const rawNext = typeof sp.next === "string" ? sp.next : null;
  const next = safeNext(rawNext);
  const [t, settings] = await Promise.all([getT(), getSiteSettings()]);
  const note = await setupNote(rawNext, t, "signup");
  const nextQuery = next !== "/account" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <AuthCard
      title={t("auth.signup.title", "Create your account")}
      subtitle={note ?? t("auth.signup.subtitle", "One account for every {site} product.", { site: settings.site_name })}
      footer={
        <>
          {t("auth.signup.have_account", "Already have an account?")}{" "}
          <Link href={`/login${nextQuery}`} className="text-link hover:text-brand-hover">
            {t("auth.signup.sign_in", "Sign in")}
          </Link>
        </>
      }
    >
      <SignupForm next={next} googleEnabled={settings.auth_google_enabled} />
    </AuthCard>
  );
}
