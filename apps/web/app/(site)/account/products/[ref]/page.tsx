import { Alert, Button, Card, ProductChip, StatusBadge, cn, type Tone } from "@retexia/ui";
import { Icon } from "@retexia/ui/icon";
import { ArrowLeft, CircleCheck, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelOrderButton } from "@/components/account/cancel-order";
import { canOpenPanel } from "@/components/account/order-card";
import { BillingButton } from "@/components/account/billing-button";
import { PaddlePay } from "@/components/account/paddle-pay";
import { PaymentProofForm } from "@/components/account/payment-proof-form";
import { Markdown } from "@/components/markdown";
import { requireUser } from "@/lib/auth";
import { getForm, getOrderStatuses, getProducts, getSiteSettings } from "@/lib/content";
import { formatDate, formatPrice } from "@/lib/format";
import { whatsappHref } from "@/lib/links";
import { getMyOrder, getOrderPayments, getVisibleServiceFields } from "@/lib/orders";
import { paddleEnv, paddleReady } from "@/lib/paddle.server";
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
  const [payments, serviceFields, { data: pkgPrices }] = await Promise.all([
    getOrderPayments(supabase, order.id),
    getVisibleServiceFields(supabase, order.id),
    supabase.from("packages").select("paddle_price_monthly, paddle_price_yearly").eq("id", order.package_id).maybeSingle(),
  ]);
  // Online payment through Paddle when it is set up and the plan is in the Paddle catalog.
  const payOnline = paddleReady() && Boolean(order.billing_cycle === "yearly" ? pkgPrices?.paddle_price_yearly : pkgPrices?.paddle_price_monthly);
  const pendingProof = payments.find((p) => p.status === "pending");
  const awaitingPayment = order.status === "awaiting_payment";

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
        {order.status_note && ["paused", "rejected", "cancelled"].includes(order.status) ? (
          <Alert tone={order.status === "rejected" ? "danger" : "warning"} title={order.status === "paused" ? t("order.paused_note", "Why it is paused") : t("order.closed_note", "Message from the team")} className="max-w-content">
            <p className="whitespace-pre-line">{order.status_note}</p>
          </Alert>
        ) : null}
      </header>

      {awaitingPayment && payOnline ? (
        <Card as="section" aria-labelledby="pay-title" className="flex flex-col gap-4 border-warning/40!">
          <div className="flex flex-col gap-1">
            <h2 id="pay-title" className="type-h2 text-ink">
              {t("order.paddle.title", "Pay to start")}
            </h2>
            <p className="type-body text-ink-muted">
              {t("order.paddle.intro", "{plan}, billed {cycle}{setup}. Pay by card, Apple Pay, Google Pay or PayPal. Tax is added where it applies.", {
                plan: order.package_name ?? "",
                cycle: order.billing_cycle === "yearly" ? t("order.paddle.yearly", "yearly") : t("order.paddle.monthly", "monthly"),
                setup: (order.setup_fee ?? 0) > 0 ? t("order.paddle.with_setup", ", with the one-time setup fee on the first payment") : "",
              })}
            </p>
          </div>
          <PaddlePay
            refId={order.ref ?? ""}
            env={paddleEnv()}
            token={process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? ""}
            autoOpen={sp.pay === "1"}
            labels={{
              pay: t("order.paddle.pay", "Pay now"),
              paying: t("order.paddle.opening", "Opening checkout…"),
              received: t("order.paddle.received", "Payment received"),
              confirming: t("order.paddle.confirming", "Thank you! We're confirming it with Paddle. This page updates by itself in a few seconds."),
              secure: t("order.paddle.secure", "Secure checkout by Paddle"),
              failed: t("order.paddle.failed", "The checkout couldn't open. Check your connection and try again."),
            }}
          />
          <p className="type-small text-ink-muted">
            {t("order.paddle.mor", "Our order process is conducted by our online reseller Paddle.com, the Merchant of Record for all our orders.")}
          </p>
        </Card>
      ) : null}

      {awaitingPayment && !payOnline ? (
        <Card as="section" aria-labelledby="pay-title" className="flex flex-col gap-5 border-warning/40!">
          <div className="flex flex-col gap-1">
            <h2 id="pay-title" className="type-h2 text-ink">
              {t("order.pay.title", "How to pay")}
            </h2>
            <p className="type-body text-ink-muted">
              {t("order.pay.amount", "Amount due now: {amount} (setup fee and first period).", { amount: fmt((order.setup_fee ?? 0) + (order.price_amount ?? 0)) })}
            </p>
          </div>
          {settings.payment_instructions ? (
            <div className="rounded-md bg-surface-sunk p-4">
              <Markdown size="sm">{settings.payment_instructions}</Markdown>
            </div>
          ) : (
            <p className="type-body text-ink-muted">{t("order.pay.no_instructions", "We have sent the payment details to your email and WhatsApp.")}</p>
          )}
          {pendingProof ? (
            <Alert tone="info" title={t("order.proof.received", "Payment proof received")}>
              {t("order.proof.checking", "Thank you. We are checking your payment from {date} and will confirm it soon.", { date: formatDate(pendingProof.created_at, settings.currency_locale) })}
            </Alert>
          ) : (
            <div className="flex flex-col gap-3 border-t border-line pt-5">
              <h3 className="type-h3 text-ink">{t("order.proof.title", "Already paid? Send us the slip")}</h3>
              <PaymentProofForm orderId={order.id} orderRef={order.ref ?? ""} />
            </div>
          )}
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {order.paddle_customer_id && paddleReady() ? <BillingButton refId={order.ref ?? ""} label={t("order.paddle.manage", "Manage billing")} /> : null}
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
            {order.starts_at ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("order.started", "Live since")}</dt>
                <dd className="text-right text-ink">{formatDate(order.starts_at, settings.currency_locale)}</dd>
              </div>
            ) : null}
            {order.renews_at && order.status === "active" ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("order.renews", "Next payment due")}</dt>
                <dd className="text-right text-ink">{formatDate(order.renews_at, settings.currency_locale)}</dd>
              </div>
            ) : null}
            {order.paused_at && order.status === "paused" ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">{t("order.paused_since", "Paused since")}</dt>
                <dd className="text-right text-ink">{formatDate(order.paused_at, settings.currency_locale)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>

      {serviceFields.length ? (
        <Card as="section" aria-labelledby="setup-title" className="flex flex-col gap-4">
          <h2 id="setup-title" className="type-h2 text-ink">
            {t("order.setup", "Your setup")}
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {serviceFields.map((f) => (
              <div key={f.key}>
                <dt className="type-small text-ink-muted">{f.label}</dt>
                <dd className="type-body break-words text-ink">
                  {f.type === "toggle"
                    ? f.value === true || f.value === "true"
                      ? t("common.yes", "Yes")
                      : t("common.no", "No")
                    : f.type === "date" && typeof f.value === "string"
                      ? formatDate(f.value, settings.currency_locale)
                      : f.type === "url" && typeof f.value === "string" && /^https?:\/\//.test(f.value)
                        ? (
                            <a href={f.value} className="text-link underline" target="_blank" rel="noopener noreferrer">
                              {f.value}
                            </a>
                          )
                        : String(f.value ?? "")}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      {payments.length ? (
        <Card as="section" aria-labelledby="payments-title" className="flex flex-col gap-4">
          <h2 id="payments-title" className="type-h2 text-ink">
            {t("order.payments", "Payments")}
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="flex flex-col">
                  <span className="type-label text-ink">
                    {p.kind === "subscription"
                      ? t("order.payment.subscription", "Subscription")
                      : p.kind === "refund"
                        ? t("order.payment.refund", "Refund")
                        : p.kind === "setup_fee"
                          ? t("order.payment.setup", "Setup and first period")
                          : t("order.payment.other", "Payment")}
                    {" · "}
                    {formatPrice(p.kind === "refund" ? -p.amount : p.amount, p.currency ?? currency, settings.currency_locale)}
                  </span>
                  <span className="type-small text-ink-muted">
                    {formatDate(p.paid_at ?? p.created_at, settings.currency_locale)}
                    {p.period_start && p.period_end ? ` · ${formatDate(p.period_start, settings.currency_locale)} – ${formatDate(p.period_end, settings.currency_locale)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <StatusBadge
                    tone={p.status === "confirmed" ? "success" : p.status === "pending" ? "warning" : "neutral"}
                    label={p.status === "confirmed" ? t("order.payment.confirmed", "Paid") : p.status === "pending" ? t("order.payment.pending", "Being checked") : t("order.payment.refunded", "Refunded")}
                  />
                  {p.receipt_number ? (
                    <Link href={`/account/receipts/${p.id}`} className="inline-flex items-center gap-1 type-label text-link hover:underline">
                      <FileText aria-hidden size={14} strokeWidth={1.5} />
                      {t("order.payment.receipt", "Receipt {number}", { number: p.receipt_number })}
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

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
