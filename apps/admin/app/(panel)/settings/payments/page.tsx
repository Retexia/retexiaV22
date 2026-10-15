import { can } from "@retexia/supabase";
import { PageHeader } from "@retexia/ui/admin";
import { PaymentMethodsCard } from "@/components/settings/payment-methods-card";
import { PayhereCard } from "@/components/settings/payhere-card";
import { PaymentsForm } from "@/components/settings/payments-form";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Payments and invoices" };

export default async function PaymentSettingsPage() {
  const staff = await requireStaffPage("manageSettings");
  const { supabase } = staff;
  const [{ data: s }, { data: methods }] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).single(),
    supabase.from("payment_methods").select("key, label, description, status, is_default, instructions").order("sort_order"),
  ]);
  if (!s) return null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payments and invoices" description="How customers pay: bank transfer and card. Receipts are made automatically for every confirmed payment." />
      <PaymentMethodsCard methods={methods ?? []} canAdmin={can(staff.role, "manageSettings")} />
      <PayhereCard />
      <PaymentsForm
        currency={s.currency_code}
        siteName={s.site_name}
        logoUrl={s.logo_url}
        email={s.contact_email}
        phone={s.contact_phone}
        initial={{
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
