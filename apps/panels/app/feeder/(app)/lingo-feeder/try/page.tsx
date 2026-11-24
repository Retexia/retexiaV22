import { TryLingo } from "@/components/feeder/lingo-feeder/try-lingo";
import { lingoFeederContext, products } from "@/lib/feeder/lingo-feeder/data";
import { engineReady } from "@/lib/feeder/lingo-feeder/engine";

export const metadata = { title: "Try Lingo · Lingo Feeder" };

export default async function TryPage() {
  const { ctx } = await lingoFeederContext("/lingo-feeder/try");
  if (!ctx) return null;
  const list = (await products(ctx.userId)).filter((p) => p.enabled);
  const first = list.find((p) => p.picture_url) ?? list[0];
  return <TryLingo products={list.map((p) => ({ id: p.id, name: p.name }))} initial={first?.id ?? null} ready={engineReady()} />;
}
