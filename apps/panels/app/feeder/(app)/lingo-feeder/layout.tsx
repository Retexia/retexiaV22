import { Alert, Badge, Button, Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { LfNav, LingoSwitch } from "@/components/feeder/lingo-feeder/common";
import { home, lingoFeederContext } from "@/lib/feeder/lingo-feeder/data";

export const metadata = { title: "Lingo Feeder" };

/** feeder.retexia.com/lingo-feeder: Lingo answers the seller's WhatsApp ad customers and takes their orders (paid package). */
export default async function LingoFeederLayout({ children }: { children: ReactNode }) {
  const { feeder, pkg, ctx, error } = await lingoFeederContext("/lingo-feeder");
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Lingo Feeder" />
        <Alert tone="danger" title="Lingo Feeder isn't ready yet">
          The database said: {error}. Retexia needs to run migrations 0039 and 0040 and add &quot;lingo_feeder&quot; to Supabase → Settings → Data API → Exposed schemas.
        </Alert>
      </div>
    );
  }
  if (!pkg || !ctx) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Lingo Feeder" description={pkg?.tagline ?? "Lingo answers your WhatsApp ad customers and takes their orders, day and night."} />
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-sunk text-ink-muted">
            <Lock aria-hidden size={22} strokeWidth={1.5} />
          </span>
          <h2 className="type-h2 text-ink">Lingo Feeder is locked</h2>
          <p className="max-w-md type-body text-ink-muted">
            Customers who tap your Click-to-WhatsApp ads meet Lingo on your own number: the product photo and details, a warm greeting by name, answers in Sinhala, Singlish or English, and the order taken with simple buttons. LKR 5,900 a month, the first 7 days free.
          </p>
          <Button href={feeder.buyUrl(pkg?.slug ?? "lingo-feeder")} target="_self">Start the free trial</Button>
        </Card>
      </div>
    );
  }
  const { seller, number } = ctx;
  const h = await home(ctx.userId).catch(() => null);
  const on = seller.status === "live";
  const noBusiness = !seller.business_name || seller.business_name === "My shop";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lingo Feeder"
        chips={
          <>
            <Badge tone={on ? "success" : "neutral"}>{on ? "Answering" : seller.status === "blocked" ? "On hold" : "Off"}</Badge>
            {number?.display_phone ? <Badge tone="neutral">{number.display_phone}</Badge> : null}
          </>
        }
        description={`${seller.business_name === "My shop" ? "Your shop" : seller.business_name}'s WhatsApp assistant: she shows the product, answers questions and takes the order. You see every chat and who to call.`}
        actions={number?.status === "connected" || on ? <LingoSwitch on={on} /> : null}
      />
      {noBusiness ? (
        <Alert tone="info" title="Start with your business details" action={<Button href="/lingo-feeder/business" size="sm">Add details</Button>}>
          Lingo introduces herself with your shop&apos;s name and tells customers where you are and when you call.
        </Alert>
      ) : !number ? (
        <Alert tone="info" title="Connect your WhatsApp number" action={<Button href="/lingo-feeder/whatsapp" size="sm">Connect</Button>}>
          Lingo answers on your own number through Meta&apos;s official WhatsApp Cloud API. Until then, try her in Try Lingo.
        </Alert>
      ) : number.status === "problem" ? (
        <Alert tone="danger" title="Your WhatsApp number has a problem" action={<Button href="/lingo-feeder/whatsapp" size="sm" variant="secondary">Fix it</Button>}>
          {number.problem ?? "WhatsApp didn't answer the last check."}
        </Alert>
      ) : number.status === "pending" ? (
        <Alert tone="warning" title="Test your connection" action={<Button href="/lingo-feeder/whatsapp" size="sm" variant="secondary">Open</Button>}>
          Your number is saved. Press Test connection, then switch Lingo on.
        </Alert>
      ) : !on && seller.status !== "blocked" ? (
        <Alert tone="warning" title="Lingo is off">New messages wait in Chats for you. Switch her on at the top when you&apos;re ready.</Alert>
      ) : null}
      <LfNav call={h?.call ?? 0} toExport={h?.to_export ?? 0} />
      {children}
    </div>
  );
}
