import { notFound } from "next/navigation";
import { ChatView } from "@/components/feeder/lingo-feeder/chat-view";
import { chat, lingoFeederContext } from "@/lib/feeder/lingo-feeder/data";

export const metadata = { title: "Chat · Lingo Feeder" };

export default async function ChatPage({ params }: { params: Promise<{ phone: string }> }) {
  const { phone } = await params;
  if (!/^\d{6,20}$/.test(phone)) notFound();
  const { ctx } = await lingoFeederContext(`/lingo-feeder/chats/${phone}`);
  if (!ctx) return null;
  const data = await chat(ctx.userId, phone);
  if (!data) notFound();
  return <ChatView {...data} />;
}
