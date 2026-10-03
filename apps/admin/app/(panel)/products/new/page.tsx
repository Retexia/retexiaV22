import { PageHeader } from "@retexia/ui/admin";
import { ProductWizard } from "@/components/products/product-wizard";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const { supabase } = await requireStaffPage("manageProducts");
  const [{ data: products }, { data: settings }] = await Promise.all([
    supabase.from("products").select("id, name, code, slug, color_light").order("sort_order"),
    supabase.from("site_settings").select("currency_code").eq("id", 1).maybeSingle(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: "/products", label: "Products" }} title="New product" description="Five short steps. The product starts hidden, so take your time." />
      <ProductWizard
        currency={settings?.currency_code ?? "LKR"}
        others={(products ?? []).map((p) => ({ id: p.id, name: p.name, code: p.code, slug: p.slug, color_light: p.color_light ?? "#2a68d9" }))}
      />
    </div>
  );
}
