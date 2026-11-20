import { TestBot } from "@/components/feeder/lingo/test-bot";
import { lingoContext, products } from "@/lib/feeder/lingo/data";
import { engineReady } from "@/lib/feeder/lingo/engine";

export const metadata = { title: "Test bot · Lingo" };

export default async function LingoTest() {
  const { ctx } = await lingoContext("/lingo/test");
  if (!ctx) return null;
  const list = (await products(ctx.id)).filter((p) => p.active);
  return <TestBot products={list.map((p) => ({ id: p.id, name: p.name }))} ready={engineReady()} />;
}
