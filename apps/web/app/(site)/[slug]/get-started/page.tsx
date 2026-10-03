import { Alert, Button, Container, Skeleton, productAccentVars } from "@retexia/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OnboardingFlow, type OnboardingPackage } from "@/components/onboarding/onboarding-flow";
import { requireUser } from "@/lib/auth";
import { getForm, getPackages, getProductByPageSlug, getSiteSettings } from "@/lib/content";
import { initialValues } from "@/lib/forms/engine";
import { formatPrice } from "@/lib/format";
import { getT } from "@/lib/strings.server";

export async function generateMetadata({ params }: PageProps<"/[slug]/get-started">): Promise<Metadata> {
  const { slug } = await params;
  const [product, t] = await Promise.all([getProductByPageSlug(slug), getT()]);
  return {
    title: product ? t("onboarding.meta_title", "Set up {name}", { name: product.name }) : undefined,
    robots: { index: false },
  };
}

export default function GetStartedPage(props: PageProps<"/[slug]/get-started">) {
  return (
    <Suspense fallback={<GetStartedSkeleton />}>
      <GetStarted {...props} />
    </Suspense>
  );
}

function GetStartedSkeleton() {
  return (
    <Container className="py-12 md:py-16">
      <div aria-busy="true" className="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-12">
        <Skeleton className="h-72 w-full rounded-lg" />
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </Container>
  );
}

async function GetStarted({ params, searchParams }: PageProps<"/[slug]/get-started">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const product = await getProductByPageSlug(slug);
  if (!product || product.status !== "live") notFound();

  const requestedPackage = typeof sp.package === "string" ? sp.package : null;
  const requestedCycle = sp.cycle === "yearly" ? "yearly" : "monthly";
  const nextPath = `/${slug}/get-started${requestedPackage ? `?package=${encodeURIComponent(requestedPackage)}&cycle=${requestedCycle}` : ""}`;

  const [{ supabase, user, profile }, settings, t] = await Promise.all([requireUser(nextPath), getSiteSettings(), getT()]);
  const [packages, form] = await Promise.all([
    getPackages(product.id),
    product.onboarding_form_id ? getForm(product.onboarding_form_id) : Promise.resolve(null),
  ]);
  const active = packages.filter((p) => p.is_active);

  if (!form || !form.steps.length || !active.length) {
    return (
      <Container size="content" className="py-24">
        <Alert
          tone="info"
          title={t("onboarding.not_ready_title", "Almost ready")}
          action={<Button href="/contact" size="sm">{t("faq.contact_link", "Talk to us")}</Button>}
        >
          {t("onboarding.not_ready_text", "Online sign-up for {name} opens soon. Talk to us and we will set it up for you.", { name: product.name })}
        </Alert>
      </Container>
    );
  }

  const chosen = active.find((p) => p.slug === requestedPackage) ?? active.find((p) => p.is_featured) ?? active[0]!;
  const cycle = requestedCycle === "yearly" && chosen.price_yearly !== null ? "yearly" : "monthly";

  const { data: openOrders } = await supabase
    .from("orders")
    .select("ref, status, created_at, order_statuses(is_final)")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false });
  const existing = (openOrders ?? []).find((o) => o.order_statuses && !o.order_statuses.is_final);

  const fmt = (n: number | null, currency: string | null) =>
    n === null ? null : formatPrice(n, currency ?? settings.currency_code, settings.currency_locale);
  const options: OnboardingPackage[] = active.map((p) => ({
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    monthly: fmt(p.price_monthly, p.currency)!,
    yearly: fmt(p.price_yearly, p.currency),
    setupFee: p.setup_fee > 0 ? fmt(p.setup_fee, p.currency) : null,
  }));

  return (
    <div className="py-12 md:py-16" style={productAccentVars(product.slug)}>
      <Container>
        <header className="mb-8 flex flex-col gap-2 md:mb-12">
          <p className="type-eyebrow text-accent">{product.name}</p>
          <h1 className="type-display text-ink">{form.title}</h1>
          {form.description ? <p className="max-w-content type-body-lg text-ink-muted">{form.description}</p> : null}
        </header>
        {existing?.ref ? (
          <div className="mb-8">
            <Alert
              tone="warning"
              title={t("onboarding.existing_title", "You already have a {name} request", { name: product.short_name })}
              action={
                <Button href={`/account/products/${encodeURIComponent(existing.ref)}`} variant="secondary" size="sm">
                  {t("onboarding.existing_view", "View it")}
                </Button>
              }
            >
              {t("onboarding.existing_text", "Request {ref} is still open. You can view it, or continue below to start another.", { ref: existing.ref })}
            </Alert>
          </div>
        ) : null}
        <OnboardingFlow
          userId={user.id}
          product={{ slug: product.slug, pageSlug: slug, name: product.name, shortName: product.short_name }}
          packages={options}
          initialPackage={chosen.slug}
          initialCycle={cycle}
          form={form}
          initial={initialValues(form, {
            full_name: profile?.full_name,
            phone: profile?.phone,
            whatsapp: profile?.whatsapp,
            business_name: profile?.business_name,
            email: user.email,
          })}
        />
      </Container>
    </div>
  );
}
