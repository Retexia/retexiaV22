import { ConnectForm } from "@/components/feeder/lingo-feeder/connect-form";
import { OrderFormCard } from "@/components/feeder/lingo-feeder/order-form-card";
import { lingoFeederContext } from "@/lib/feeder/lingo-feeder/data";
import { webhookUrl } from "@/lib/feeder/lingo-feeder/engine";

export const metadata = { title: "WhatsApp · Lingo Feeder" };

export default async function WhatsAppPage() {
  const { ctx } = await lingoFeederContext("/lingo-feeder/whatsapp");
  if (!ctx) return null;
  return (
    <div className="flex flex-col gap-6">
      {ctx.number?.status === "connected" ? <OrderFormCard number={ctx.number} /> : null}
      <ConnectForm number={ctx.number} webhookUrl={webhookUrl()} />
    </div>
  );
}
