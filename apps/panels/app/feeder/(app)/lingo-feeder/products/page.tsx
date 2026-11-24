import { ProductsView } from "@/components/feeder/lingo-feeder/products";
import { ads, lingoFeederContext, products } from "@/lib/feeder/lingo-feeder/data";

export const metadata = { title: "Products · Lingo Feeder" };

export default async function ProductsPage() {
  const { ctx } = await lingoFeederContext("/lingo-feeder/products");
  if (!ctx) return null;
  const [list, adList] = await Promise.all([products(ctx.userId), ads(ctx.userId)]);
  return <ProductsView products={list} ads={adList} />;
}
