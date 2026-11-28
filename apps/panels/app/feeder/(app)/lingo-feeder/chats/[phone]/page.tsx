import { notFound } from "next/navigation";
import { ChatView } from "@/components/feeder/lingo-feeder/chat-view";
import { chat, lingoFeederContext, products } from "@/lib/feeder/lingo-feeder/data";

export const metadata = { title: "Chat · Lingo Feeder" };

export default async function ChatPage({ params }: { params: Promise<{ phone: string }> }) {
  const { phone } = await params;
  if (!/^\d{6,20}$/.test(phone)) notFound();
  const { ctx } = await lingoFeederContext(`/lingo-feeder/chats/${phone}`);
  if (!ctx) return null;
  const [data, list] = await Promise.all([chat(ctx.userId, phone), products(ctx.userId).catch(() => [])]);
  if (!data) notFound();
  return <ChatView {...data} catalog={list.filter((p) => p.enabled).map((p) => ({ id: p.id, name: p.name, price: p.price, delivery_fee: p.delivery_fee }))} />;
}
