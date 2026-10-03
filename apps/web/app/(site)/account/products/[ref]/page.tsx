import { Button, Card, ProductChip, StatusBadge, cn, type Tone } from "@retexia/ui";
import { Icon } from "@retexia/ui/icon";
import { ArrowLeft, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelOrderButton } from "@/components/account/cancel-order";
import { canOpenPanel } from "@/components/account/order-card";
import { requireUser } from "@/lib/auth";
import { getForm, getOrderStatuses, getProducts, getSiteSettings } from "@/lib/content";
import { formatDate, formatPrice } from "@/lib/format";
import { whatsappHref } from "@/lib/links";
import { getMyOrder } from "@/lib/orders";
import { getT } from "@/lib/strings.server";

export async function generateMetadata({ params }: PageProps<"/account/products/[ref]">): Promise<Metadata> {
  const { ref } = await params;
  return { title: decodeURIComponent(ref) };
}

export default async function OrderPage({ params, searchParams }: PageProps<"/account/products/[ref]">) {
  const [{ ref: rawRef }, sp] = await Promise.all([params, searchParams]);
  const ref = decodeURIComponent(rawRef);
  const [{ supabase }, settings, products, statuses, t] = await Promise.all([
    requireUser(`/account/products/${encodeURIComponent(ref)}`),
    getSiteSettings(),
    getProducts(),
    getOrderStatuses(),
    getT(),
  ]);
  const data = await getMyOrder(supabase, ref);
  if (!data) notFound();
  const { order, events } = data;

  const product = products.find((p) => p.id === order.product_id);
  const status = statuses.find((s) => s.key === order.status);
  const statusLabel = (key: string | null) => statuses.find((s) => s.key === key)?.label ?? key ?? "";
  const currency = order.currency ?? settings.currency_code;
  const fmt = (n: number | null) => formatPrice(n, currency, settings.currency_locale);
  const isNew = sp.new === "1";
  const form = isNew && product?.onboarding_form_id ? await getForm(product.onboarding_form_id) : null;
  const panel = canOpenPanel(product, order);
  const wa = whatsappHref(
    settings,
    t("order.whatsapp_message", "Hi, I have a question about my request {ref}.", { ref: order.ref ?? "" }),
  );

  // Answers grouped by the step they were asked in.
  const groups = new Map<string, typeof order.answers>();
  for (const a of order.answers) {
    const key = a.step || t("order.answers", "Your answers");
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  // What happens next: the open statuses after "submitted", in order.
  const nextSteps = statuses.filter((s) => !s.is_final && s.description && s.key !== "paused").slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/account/products"
        className="inline-flex items-center gap-1.5 self-start rounded-full type-label text-ink-muted transition-hover hover:text-ink focus-visible:focus-ring"
      >
        <ArrowLeft aria-hidden size={16} strokeWidth={1.5} />
        {t("account.nav.products", "My products")}
      </Link>

      {isNew ? (
        <Card className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
            <CircleCheck aria-hidden size={26} strokeWidth={1.5} />
          </span>
          <h1 className="type-display text-ink">{form?.success_title ?? t("order.success.title", "Request received")}</h1>
          <p className="type-body text-ink-muted">
            {t("order.success.ref", "Your reference is")} <span className="type-code text-ink">{order.ref}</span>
          </p>
          <p className="max-w-measure type-body-lg text-ink-muted">
            {form?.success_message ?? t("order.success.text", "Thank you. We will review your details and message you within one working day.")}
          </p>
          {nextSteps.length ? (
            <div className="mt-2 w-full max-w-measure text-left">
              <h2 className="mb-3 text-center type-h3 text-ink">{t("order.success.next", "What happens next")}</h2>
              <ol className="flex flex-col gap-3">
                {nextSteps.map((s, i) => (
                  <li key={s.key} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-px flex size-6 shrink-0 items-center justify-center rounded-full type-caption",
                        i === 0 ? "bg-brand text-on-brand" : "border border-line-strong text-ink-muted",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex flex-col">
                      <span className="type-label text-ink">{s.label}</span>
                      <span className="type-small text-ink-muted">{s.description}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {wa ? (
            <Button href={wa} className="mt-2" icon={<Icon name="message-circle" size={16} />}>
              {t("order.success.whatsapp", "Message us about {ref}", { ref: order.ref ?? "" })}
            </Button>
          ) : null}
        </Card>
      ) : null}

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {product ? (
            <ProductChip slug={product.slug} name={product.short_name} size="sm" icon={<Icon name={product.icon} fallback="box" size={14} />} />
          ) : null}
          <StatusBadge tone={(status?.tone as Tone) ?? "neutral"} label={status?.label ?? order.status} />
          <span className="type-code text-ink-muted">{order.ref}</span>
        </div>
        {isNew ? (
          <h2 className="type-h1 text-ink">{order.package_name}</h2>
        ) : (
          <h1 className="type-h1 text-ink">{order.package_name}</h1>
        )}
        {status?.description ? <p className="max-w-content type-body-lg text-ink-muted">{status.description}</p> : null}
      </header>

      <div className="flex flex-wrap gap-3">
        {product?.panel_url ? (
          panel ? (
            <Button href={product.panel_url}>{t("order.open_panel", "Open {name} panel", { name: product.short_name })}</Button>
          ) : (
            <div className="flex flex-col gap-1">
              <Button disabled>{t("order.open_panel", "Open {name} panel", { name: product.short_name })}</Button>
              <p className="type-small text-ink-muted">{t("order.panel_pending", "Your panel opens when setup is finished.")}</p>
            </div>
          )
        ) : null}
        {wa && !isNew ? (
          <Button href={wa} variant="secondary" icon={<Icon name="message-circle" size={16} />}>
            {t("contact.whatsapp_button", "Message us on WhatsApp")}
          </Button>
        ) : null}
        {status?.customer_can_cancel && order.id && order.ref ? <CancelOrderButton orderId={order.id} orderRef={order.ref} /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card as="section" aria-labelledby="timeline-title" className="flex flex-col gap-4">
          <h2 id="timeline-title" className="type-h2 text-ink">
            {t("order.timeline", "Timeline")}
          </h2>
          <ol className="relative flex flex-col gap-6 border-l border-line pl-6">
            {[...events].reverse().map((e, i) => (
              <li key={e.id} className="relative flex flex-col gap-0.5">
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 -left-[29px] size-2.5 rounded-full ring-4 ring-surface-raised",
                    i === 0 ? "bg-brand" : "bg-line-strong",
                  )}
                />
                <span className="type-label text-ink">{statusLabel(e.to_status)}</span>
                <time dateTime={e.created_at} className="type-small text-ink-muted">
                  {formatDate(e.created_at, settings.currency_locale, true)}
                </time>
                {e.note ? <p className="mt-1 type-body text-ink-muted">{e.note}</p> : null}
              </li>
            ))}
          </ol>
        </Card>

        <Card as="section" aria-labelledby="summary-title" className="flex flex-col gap-4 self-start">
          <h2 id="summary-title" className="type-h2 text-ink">
            {t("order.summary", "Summary")}
          </h2>
          <dl className="flex flex-col gap-3 type-body">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("order.package", "Package")}</dt>
              <dd className="text-right text-ink">{order.package_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("order.billing", "Billing")}</dt>
              <dd className="text-right text-ink">
                {order.billing_cycle === "yearly" ? t("pricing.yearly", "Yearly") : t("pricing.monthly", "Monthly")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("order.price", "Price")}</dt>
              <dd className="text-right text-ink">
                {fmt(order.price_amount)} {order.billing_cycle === "yearly" ? t("pricing.per_year", "/ year") : t("pricing.per_month", "/ month")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{t("order.setup_fee", "Setup fee")}</dt>
              <dd className="text-right text-ink">{order.setup_fee ? fmt(order.setup_fee) : t("order.none", "None")}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-line pt-3">
              <dt className="text-ink-muted">{t("order.submitted", "Submitted")}</dt>
              <dd className="text-right text-ink">{formatDate(order.created_at, settings.currency_locale)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {groups.size ? (
        <section aria-labelledby="answers-title" className="flex flex-col gap-4">
          <h2 id="answers-title" className="type-h2 text-ink">
            {t("order.answers", "Your answers")}
          </h2>
          {[...groups.entries()].map(([step, answers]) => (
            <Card key={step} className="flex flex-col gap-4">
              <h3 className="type-h3 text-ink">{step}</h3>
              <dl className="grid gap-4 sm:grid-cols-2">
                {answers.map((a) => (
                  <div key={a.key} className={String(a.display_value).length > 60 ? "sm:col-span-2" : undefined}>
                    <dt className="type-small text-ink-muted">{a.label}</dt>
                    <dd className="type-body break-words whitespace-pre-line text-ink">{a.display_value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
