import { PageHeader } from "@retexia/ui/admin";
import { GroupsEditor } from "@/components/post/groups-editor";
import { ProductsEditor } from "@/components/post/products-editor";
import { requireBusinessPage } from "@/lib/post/session";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const { business, db } = await requireBusinessPage("/products");
  const [{ data: products }, { data: media }, { data: groups }] = await Promise.all([
    db.from("products").select("*").eq("business_id", business.id).order("created_at", { ascending: false }),
    db.from("media").select("product_id").eq("business_id", business.id).not("product_id", "is", null),
    db.from("product_groups").select("id, name, product_ids").eq("business_id", business.id).order("name"),
  ]);
  const photos = (media ?? []).reduce<Record<string, number>>((m, x) => ({ ...m, [x.product_id!]: (m[x.product_id!] ?? 0) + 1 }), {});
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Products and services" description="What the AI can promote. Prices here are the only prices it will ever put in a post." />
      <ProductsEditor
        currency={business.country === "LK" ? "LKR" : "USD"}
        products={(products ?? []).map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, description: p.description ?? "", active: p.active, photos: photos[p.id] ?? 0 }))}
      />
      <GroupsEditor groups={groups ?? []} products={(products ?? []).map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
