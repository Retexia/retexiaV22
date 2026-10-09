import { Button } from "@retexia/ui";
import { Receipt, type ReceiptData } from "@retexia/ui/receipt";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/account/print-button";
import { requireUser } from "@/lib/auth";
import { getProducts, getSiteSettings } from "@/lib/content";
import { formatDate, formatPrice } from "@/lib/format";
import { getT } from "@/lib/strings.server";

export const metadata: Metadata = { title: "Receipt" };

/** The customer's own receipt for a confirmed or refunded payment. Print → Save as PDF. */
export default async function CustomerReceiptPage({ params }: PageProps<"/account/receipts/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ supabase, user }, settings, products, t] = await Promise.all([requireUser(`/account/receipts/${id}`), getSiteSettings(), getProducts(), getT()]);
  // RLS: only the customer's own payments are visible.
  const { data: payment } = await supabase
    .from("payments")
    .select("id, order_id, kind, amount, currency, method, reference, status, paid_at, confirmed_at, created_at, receipt_number, period_start, period_end")
    .eq("id", id)
    .maybeSingle();
  if (!payment?.receipt_number || payment.status === "pending") notFound();
  const [{ data: order }, { data: profile }] = await Promise.all([
    supabase.from("orders").select("ref, product_id, package_name, billing_cycle, currency").eq("id", payment.order_id).maybeSingle(),
    supabase.from("profiles").select("full_name, email, phone, business_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!order) notFound();
  const product = products.find((p) => p.id === order.product_id);
  const locale = settings.currency_locale;
  const currency = payment.currency ?? order.currency ?? settings.currency_code;
  const kind =
    payment.kind === "subscription"
      ? t("order.payment.subscription", "Subscription")
      : payment.kind === "refund"
        ? t("order.payment.refund", "Refund")
        : payment.kind === "setup_fee"
          ? t("order.payment.setup", "Setup and first period")
          : t("order.payment.other", "Payment");
  const data: ReceiptData = {
    business: {
      name: settings.invoice_business_name || settings.site_name,
      address: settings.invoice_address ?? settings.address,
      logoUrl: settings.invoice_logo_url ?? settings.logo_url,
      footer: settings.invoice_footer,
      email: settings.contact_email,
      phone: settings.contact_phone,
    },
    number: payment.receipt_number,
    date: formatDate(payment.paid_at ?? payment.confirmed_at ?? payment.created_at, locale),
    status: payment.status,
    customer: { name: profile?.full_name, email: profile?.email ?? user.email, phone: profile?.phone, business: profile?.business_name },
    order: {
      ref: order.ref ?? "",
      product: product?.name ?? "",
      package: order.package_name ?? "",
      billing: order.billing_cycle === "yearly" ? t("pricing.yearly", "Yearly") : t("pricing.monthly", "Monthly"),
    },
    items: [
      {
        label: `${product?.name ?? ""} · ${order.package_name ?? ""}: ${kind}`,
        detail: payment.period_start && payment.period_end ? `${formatDate(payment.period_start, locale)} – ${formatDate(payment.period_end, locale)}` : null,
        amount: formatPrice(payment.amount, currency, locale),
      },
    ],
    total: formatPrice(payment.kind === "refund" ? -payment.amount : payment.amount, currency, locale),
    method:
      payment.method === "online_gateway"
        ? t("receipt.method.paddle", "Online (Paddle)")
        : payment.method
          ? payment.method.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
          : null,
    reference: payment.reference,
    labels: {
      receipt: t("receipt.title", "Receipt"),
      number: t("receipt.number", "Receipt number"),
      date: t("receipt.date", "Date paid"),
      billedTo: t("receipt.billed_to", "Billed to"),
      request: t("receipt.request", "Request"),
      item: t("receipt.item", "Description"),
      amount: t("receipt.amount", "Amount"),
      total: t("receipt.total", "Total paid"),
      method: t("receipt.method", "Payment method"),
      reference: t("receipt.reference", "Reference"),
      paid: t("receipt.paid", "Paid"),
      refunded: t("receipt.refunded", "Refunded"),
    },
  };
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap justify-between gap-2 px-4 print:hidden">
        <Button href={`/account/products/${encodeURIComponent(order.ref ?? "")}`} variant="ghost" icon={<ArrowLeft aria-hidden size={16} strokeWidth={1.5} />}>
          {t("receipt.back", "Back to {ref}", { ref: order.ref ?? "" })}
        </Button>
        <PrintButton label={t("receipt.print", "Print or save as PDF")} />
      </div>
      <div className="mx-auto max-w-[210mm] bg-white shadow-float print:shadow-none">
        <Receipt data={data} />
      </div>
    </>
  );
}
