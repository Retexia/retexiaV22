import { ConnectForm } from "@/components/feeder/lingo-feeder/connect-form";
import { lingoFeederContext } from "@/lib/feeder/lingo-feeder/data";
import { webhookUrl } from "@/lib/feeder/lingo-feeder/engine";

export const metadata = { title: "WhatsApp · Lingo Feeder" };

export default async function WhatsAppPage() {
  const { ctx } = await lingoFeederContext("/lingo-feeder/whatsapp");
  if (!ctx) return null;
  return <ConnectForm number={ctx.number} webhookUrl={webhookUrl()} />;
}
