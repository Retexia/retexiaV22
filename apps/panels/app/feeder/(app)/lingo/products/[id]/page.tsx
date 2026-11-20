import { PageHeader } from "@retexia/ui/admin";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/feeder/lingo/product-editor";
import { fixedTexts, lingoContext, products } from "@/lib/feeder/lingo/data";

export const metadata = { title: "Product · Lingo" };

export default async function LingoProduct({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await lingoContext("/lingo/products");
  if (!ctx) return null;
  const id = Number((await params).id);
  const [list, texts] = await Promise.all([products(ctx.id), fixedTexts(ctx.id)]);
  const product = list.find((p) => p.id === id);
  if (!product) notFound();
  const lang = ctx.seller.default_lang === "en" ? "en" : "si";
  const ask = texts.own.ask_details?.[lang] || texts.defaults.ask_details?.[lang] || "";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={product.name} back={{ href: "/lingo/products", label: "Products" }} description={product.feeder_id ? `Feeder item ${product.feeder_id}` : undefined} />
      <ProductEditor product={product} askDetails={ask} />
    </div>
  );
}
