import { Receipt, type ReceiptData } from "@retexia/ui/admin";
import { formatDate, formatPrice } from "@retexia/ui";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/common/print-button";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Receipt" };

const words = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** A4 receipt for a confirmed (or refunded) payment. Print → Save as PDF. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaffPage("view");
  const { data: payment } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();
  if (!payment || !payment.receipt_number) notFound();
  const [{ data: order }, { data: settings }] = await Promise.all([
    supabase.from("staff_orders").select("*").eq("id", payment.order_id).maybeSingle(),
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (!order) notFound();
  const currency = payment.currency ?? order.currency ?? "LKR";
  const data: ReceiptData = {
    business: {
      name: settings?.invoice_business_name || settings?.site_name || "Retexia",
      address: settings?.invoice_address ?? settings?.address,
      logoUrl: settings?.invoice_logo_url ?? settings?.logo_url,
      footer: settings?.invoice_footer,
      email: settings?.contact_email,
      phone: settings?.contact_phone,
    },
    number: payment.receipt_number,
    date: formatDate(payment.paid_at ?? payment.confirmed_at ?? payment.created_at),
    status: payment.status,
    customer: { name: order.customer_name, email: order.customer_email, phone: order.customer_phone, business: order.customer_business },
    order: { ref: order.ref ?? "", product: order.product_name ?? "", package: order.package_name ?? "", billing: words(order.billing_cycle) },
    items: [
      {
        label: `${order.product_name ?? ""} · ${order.package_name ?? ""}: ${words(payment.kind)}`,
        detail:
          payment.kind === "subscription" && payment.period_start && payment.period_end
            ? `Period ${formatDate(payment.period_start)} to ${formatDate(payment.period_end)}`
            : payment.note,
        amount: formatPrice(payment.amount, currency),
      },
    ],
    total: formatPrice(payment.kind === "refund" ? -payment.amount : payment.amount, currency),
    method: words(payment.method),
    reference: payment.reference,
  };
  return (
    <div className="min-h-dvh bg-surface-sunk py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4 print:hidden">
        <PrintButton />
      </div>
      <div className="mx-auto max-w-[210mm] bg-white shadow-float print:shadow-none">
        <Receipt data={data} />
      </div>
    </div>
  );
}
