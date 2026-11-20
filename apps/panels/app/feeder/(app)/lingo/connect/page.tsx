import { ConnectForm } from "@/components/feeder/lingo/connect-form";
import { lingoContext } from "@/lib/feeder/lingo/data";
import { webhookUrl } from "@/lib/feeder/lingo/engine";

export const metadata = { title: "WhatsApp · Lingo" };

export default async function LingoConnect() {
  const { ctx } = await lingoContext("/lingo/connect");
  if (!ctx) return null;
  return <ConnectForm number={ctx.number} webhookUrl={webhookUrl()} />;
}
