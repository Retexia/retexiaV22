import { Alert, Badge, Button, Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { BotSwitch, LingoNav } from "@/components/feeder/lingo/common";
import { lingoContext, overview } from "@/lib/feeder/lingo/data";
import { usd } from "@/lib/feeder/lingo/labels";

export const metadata = { title: "Lingo" };

/** feeder.retexia.com/lingo: the WhatsApp sales bot for Click-to-WhatsApp ads (paid package). */
export default async function LingoLayout({ children }: { children: ReactNode }) {
  const { feeder, pkg, ctx } = await lingoContext("/lingo");
  if (!pkg || !ctx) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Lingo" description={pkg?.tagline ?? "A WhatsApp salesperson for your Click-to-WhatsApp ads."} />
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-sunk text-ink-muted">
            <Lock aria-hidden size={22} strokeWidth={1.5} />
          </span>
          <h2 className="type-h2 text-ink">Lingo is locked</h2>
          <p className="max-w-md type-body text-ink-muted">
            Customers who tap your Click-to-WhatsApp ads get the product photo, answers in Sinhala, Singlish or English, and their order is taken and confirmed on your own WhatsApp number. LKR 4,900 a month, the first 7 days free.
          </p>
          <Button href={feeder.buyUrl(pkg?.slug ?? "lingo")} target="_self">
            Start the free trial
          </Button>
        </Card>
      </div>
    );
  }
  const { seller, number, budget } = ctx;
  const o = await overview(ctx.id, 30).catch(() => null);
  const on = seller.status === "live";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lingo"
        chips={
          <>
            <Badge tone={on ? "success" : "neutral"}>{on ? "On" : seller.status === "blocked" ? "On hold" : "Off"}</Badge>
            {number?.display_phone ? <Badge tone="neutral">{number.display_phone}</Badge> : null}
          </>
        }
        description="Your WhatsApp salesperson: it shows the product, answers questions, takes the name, address and phone number and confirms the order. Anything it isn't sure about comes to your Inbox."
        actions={number?.status === "connected" || on ? <BotSwitch on={on} /> : null}
      />
      {!number ? (
        <Alert tone="info" title="Connect your WhatsApp number" action={<Button href="/lingo/connect" size="sm">Connect</Button>}>
          Lingo answers on your own number through Meta&apos;s official WhatsApp Cloud API. It takes about 15 minutes; until then, try it in the Test bot.
        </Alert>
      ) : number.status === "problem" ? (
        <Alert tone="danger" title="Your WhatsApp number has a problem" action={<Button href="/lingo/connect" size="sm" variant="secondary">Fix it</Button>}>
          {number.problem ?? "WhatsApp didn't answer the last check."}
        </Alert>
      ) : number.status === "pending" ? (
        <Alert tone="warning" title="Test your connection" action={<Button href="/lingo/connect" size="sm" variant="secondary">Open</Button>}>
          Your number is saved. Press Test connection, then switch Lingo on.
        </Alert>
      ) : !on && seller.status !== "blocked" ? (
        <Alert tone="warning" title="Lingo is off">New messages wait in your Inbox. Switch it on at the top when you&apos;re ready.</Alert>
      ) : null}
      {budget.degrade ? (
        <Alert tone="warning" title="This month's AI allowance is used up">
          Lingo still answers with your fixed texts, FAQs and saved answers; other questions come to your Inbox until next month ({usd(budget.used)} of {usd(budget.limit)} used). Adding FAQs keeps more chats automatic.
        </Alert>
      ) : budget.warn ? (
        <Alert tone="info" title="80% of this month's AI allowance is used">
          {usd(budget.used)} of {usd(budget.limit)}. Add FAQs for common questions (FAQs tab) so Lingo needs the AI less.
        </Alert>
      ) : null}
      <LingoNav needs={o?.needs_you ?? 0} toExport={o?.to_export ?? 0} />
      {children}
    </div>
  );
}
