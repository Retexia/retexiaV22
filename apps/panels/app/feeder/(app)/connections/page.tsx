import { Button, Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { Lock } from "lucide-react";
import { AccountsForm } from "@/components/feeder/autopublish/accounts-form";
import { ConnectForm } from "@/components/feeder/lingo-feeder/connect-form";
import { getAccount } from "@/lib/feeder/autopublish/data";
import { gatewayReady } from "@/lib/feeder/autopublish/gateway";
import { lingoFeederContext } from "@/lib/feeder/lingo-feeder/data";
import { webhookUrl } from "@/lib/feeder/lingo-feeder/engine";
import { USES, ownsAny, requireSharedPage, toolsUsing } from "@/lib/feeder/shared";

export const metadata = { title: "Connections" };

function Locked({ title, tools, fallback, buy }: { title: string; tools: { slug: string; name: string }[]; fallback: string; buy: (slug: string) => string }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunk text-ink-muted">
          <Lock aria-hidden size={16} strokeWidth={1.5} />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="type-h3 text-ink">{title}</h2>
          <p className="type-small text-ink-muted">Used by {tools.length ? tools.map((t) => t.name).join(" and ") : fallback}. It opens here when one of them is on your account.</p>
        </div>
      </div>
      {tools[0] ? (
        <Button href={buy(tools[0].slug)} target="_self" size="sm" variant="secondary">
          Get {tools[0].name}
        </Button>
      ) : null}
    </Card>
  );
}

/** feeder.retexia.com/connections: every account Retexia uses for you, once (Facebook, Instagram, TikTok, WhatsApp). */
export default async function ConnectionsPage() {
  const feeder = await requireSharedPage("/connections");
  const { user, packages, buyUrl } = feeder;
  const ads = ownsAny(packages, USES.ads);
  const whatsapp = ownsAny(packages, USES.whatsapp);
  const [account, lingo] = await Promise.all([ads ? getAccount(user.id) : Promise.resolve(null), whatsapp ? lingoFeederContext("/connections") : Promise.resolve(null)]);
  const adTools = toolsUsing(packages, USES.ads);
  const waTools = toolsUsing(packages, USES.whatsapp);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Connections" description="Your Facebook, Instagram, TikTok and WhatsApp accounts, once for every tool. You only see the ones your tools use." />

      <section id="facebook" className="flex scroll-mt-24 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="type-h2 text-ink">Facebook, Instagram and TikTok</h2>
          {ads ? <p className="type-small text-ink-muted">Used by {adTools.filter((t) => t.owned).map((t) => t.name).join(" and ")}.</p> : null}
        </div>
        {ads ? (
          <AccountsForm
            account={account}
            ready={gatewayReady()}
            metaBusinessId={process.env.RETEXIA_META_BUSINESS_ID?.trim() || null}
            tiktokBusinessCenterId={process.env.RETEXIA_TIKTOK_BC_ID?.trim() || null}
          />
        ) : (
          <Locked title="Ad accounts and Facebook Page" tools={adTools} fallback="Autopublish and Auto comment" buy={buyUrl} />
        )}
      </section>

      <section id="whatsapp" className="flex scroll-mt-24 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="type-h2 text-ink">WhatsApp</h2>
          {whatsapp ? <p className="type-small text-ink-muted">Used by {waTools.filter((t) => t.owned).map((t) => t.name).join(" and ")}.</p> : null}
        </div>
        {whatsapp && lingo?.ctx ? (
          <ConnectForm number={lingo.ctx.number} webhookUrl={webhookUrl()} />
        ) : whatsapp ? (
          <Card>
            <p className="type-small text-ink-muted">WhatsApp settings can&apos;t load just now{lingo?.error ? ` (${lingo.error})` : ""}. Try again in a minute.</p>
          </Card>
        ) : (
          <Locked title="WhatsApp Business number" tools={waTools} fallback="Lingo Feeder" buy={buyUrl} />
        )}
      </section>
    </div>
  );
}
