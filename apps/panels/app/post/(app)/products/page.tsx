import { PageHeader } from "@retexia/ui/admin";
import { GroupsEditor } from "@/components/post/groups-editor";
import { ProductsEditor } from "@/components/post/products-editor";
import { mediaUrls } from "@/lib/post/media";
import { requireBusinessPage } from "@/lib/post/session";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const { business, db } = await requireBusinessPage("/products");
  const [{ data: products }, { data: media }, { data: groups }] = await Promise.all([
    db.from("products").select("*").eq("business_id", business.id).order("created_at", { ascending: false }),
    db.from("media").select("id, product_id, storage_path, thumb_path").eq("business_id", business.id).not("product_id", "is", null).order("created_at"),
    db.from("product_groups").select("id, name, product_ids").eq("business_id", business.id).order("name"),
  ]);
  const urls = await mediaUrls(db, media ?? []);
  const photos: Record<string, { id: string; url: string | null }[]> = {};
  for (const m of media ?? []) (photos[m.product_id!] ??= []).push({ id: m.id, url: urls.get(m.id) ?? null });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Products and services" description="What the AI can promote. Prices here are the only prices it will ever put in a post." />
      <ProductsEditor
        currency={business.country === "LK" ? "LKR" : "USD"}
        products={(products ?? []).map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, description: p.description ?? "", active: p.active, photos: photos[p.id] ?? [] }))}
      />
      <GroupsEditor groups={groups ?? []} products={(products ?? []).map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
