import { PageHeader } from "@retexia/ui/admin";
import { PaddleCard } from "@/components/settings/paddle-card";
import { PaymentsForm } from "@/components/settings/payments-form";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Payments and invoices" };

export default async function PaymentSettingsPage() {
  const { supabase } = await requireStaffPage("manageSettings");
  const { data: s } = await supabase.from("site_settings").select("*").eq("id", 1).single();
  if (!s) return null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payments and invoices" description="How customers pay, and what receipts look like." />
      <PaddleCard currency={s.currency_code} />
      <PaymentsForm
        currency={s.currency_code}
        siteName={s.site_name}
        logoUrl={s.logo_url}
        email={s.contact_email}
        phone={s.contact_phone}
        initial={{
          payment_instructions: s.payment_instructions ?? "",
          invoice_business_name: s.invoice_business_name ?? "",
          invoice_address: s.invoice_address ?? "",
          invoice_footer: s.invoice_footer ?? "",
          invoice_logo_url: s.invoice_logo_url ?? "",
          receipt_prefix: s.receipt_prefix,
        }}
      />
    </div>
  );
}
