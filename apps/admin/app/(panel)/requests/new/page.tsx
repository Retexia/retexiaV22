import { parseForm, type FormDef } from "@retexia/forms";
import { can } from "@retexia/supabase";
import { PageHeader } from "@retexia/ui/admin";
import { NewRequest } from "@/components/requests/new-request";
import { requireStaffPage } from "@/lib/auth";
import { param, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "New request" };

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const customerId = param(sp, "customer");
  const staff = await requireStaffPage("operate");
  const { supabase } = staff;
  const { data: preset } = customerId
    ? await supabase.from("staff_customers").select("id, full_name, email, phone").eq("id", customerId).maybeSingle()
    : { data: null };
  const [products, packages, forms, settings] = await Promise.all([
    supabase.from("products").select("id, name, status, onboarding_form_id").order("sort_order"),
    supabase.from("packages").select("id, product_id, name, price_monthly, price_yearly, setup_fee, currency, is_active").order("sort_order"),
    supabase.from("forms").select("*, steps:form_steps(*, fields:form_fields(*))"),
    supabase.from("site_settings").select("currency_code").eq("id", 1).maybeSingle(),
  ]);
  const byId = new Map((forms.data ?? []).map((f) => [f.id, parseForm(f)]));
  const formByProduct: Record<string, FormDef> = {};
  for (const p of products.data ?? []) {
    const f = p.onboarding_form_id ? byId.get(p.onboarding_form_id) : undefined;
    if (f) formByProduct[p.id] = f;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: "/requests", label: "Requests" }} title="New request" description="For a customer who asked on WhatsApp, by phone or through a referral. The price is taken from the package." />
      <NewRequest
        products={(products.data ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status }))}
        packages={(packages.data ?? []).map((p) => ({ ...p, price_monthly: Number(p.price_monthly), price_yearly: p.price_yearly === null ? null : Number(p.price_yearly), setup_fee: Number(p.setup_fee) }))}
        forms={formByProduct}
        canInvite={can(staff.role, "manageCustomers")}
        currency={settings.data?.currency_code ?? "LKR"}
        initialProductId={(products.data ?? []).find((p) => p.id === param(sp, "product"))?.id}
        initialCustomer={preset?.id ? { id: preset.id, name: preset.full_name || preset.email || "Customer", email: preset.email, phone: preset.phone } : null}
      />
    </div>
  );
}
