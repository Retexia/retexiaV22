import { PageHeader } from "@retexia/ui/admin";
import { LingoProducts } from "@/components/lingo/products";
import { requireLingoPage } from "@/lib/lingo/session";
import { daysAgoIso } from "@/lib/time";

export const metadata = { title: "Products" };

export default async function LingoProductsPage() {
  const { tenant, db } = await requireLingoPage("/products");
  const since = daysAgoIso(30);
  const [{ data: products }, { data: orders }, { data: biz }] = await Promise.all([
    db.from("products").select("*").eq("lingo_user_id", tenant.id).order("product_name"),
    db.from("orders").select("product_id").eq("lingo_user_id", tenant.id).in("status", ["confirmed", "processing", "shipped", "delivered"]).gte("created_at", since).limit(5000),
    db.from("business_details").select("default_delivery_fee").eq("lingo_user_id", tenant.id).maybeSingle(),
  ]);
  const sold = (orders ?? []).reduce<Record<number, number>>((m, o) => (o.product_id ? { ...m, [o.product_id]: (m[o.product_id] ?? 0) + 1 } : m), {});
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Products" description="What Lingo can sell. It only quotes the prices here, and sends the photo the first time a customer asks about a product." />
      <LingoProducts products={(products ?? []).map((p) => ({ ...p, sold30: sold[p.id] ?? 0 }))} defaultFee={Number(biz?.default_delivery_fee ?? 0)} />
    </div>
  );
}
