import { createServerClient } from "@retexia/supabase/server";
import { Alert, Button, Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { CheckCircle2 } from "lucide-react";
import { FacebookIcon } from "@/components/post/brand-icons";
import { StartWizard } from "@/components/post/start-wizard";
import { canConnectMeta } from "@/lib/post/meta-connect";
import { PLAN_LIMITS } from "@/lib/post/plans";
import type { Brand } from "@/lib/post/post-db.types";
import { requireBusinessPage } from "@/lib/post/session";
import { whatsAppConfigured } from "@/lib/post/whatsapp";

export const metadata = { title: "Get started" };

/**
 * First visit after paying (and after the welcome screen): set up the daily
 * playlist, WhatsApp messages, Facebook & Instagram, then brand and products.
 */
export default async function StartPage() {
  const [{ business, customer, settings, db }, main] = await Promise.all([
    requireBusinessPage("/start"),
    createServerClient().then((s) => s.from("site_settings").select("whatsapp_number").eq("id", 1).maybeSingle()),
  ]);
  const [{ data: accounts }, { count: products }] = await Promise.all([
    db.from("social_accounts").select("platform, display_name, status").eq("business_id", business.id).eq("status", "connected"),
    db.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id),
  ]);
  const connected = accounts ?? [];
  const brand = (business.brand ?? {}) as Brand;
  const wa = main.data?.whatsapp_number?.replace(/[^\d]/g, "");
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hi, please connect Facebook and Instagram to Retexia Post for ${business.name} (${customer.order.ref}).`)}` : null;
  const limits = PLAN_LIMITS[business.plan];

  const connect = (
    <Card className="flex flex-col gap-4">
      {connected.length ? (
        <ul className="flex flex-col gap-2">
          {connected.map((a) => (
            <li key={`${a.platform}-${a.display_name}`} className="flex items-center gap-2 type-body text-ink">
              <CheckCircle2 aria-hidden size={16} strokeWidth={1.5} className="text-success" />
              {a.display_name ?? a.platform} <span className="type-small text-ink-muted">({a.platform === "facebook" ? "Facebook Page" : "Instagram"})</span>
            </li>
          ))}
        </ul>
      ) : canConnectMeta() ? (
        <>
          <p className="type-body text-ink-muted">
            Log in with Facebook and tick your Page and its Instagram. Your Instagram must be a <strong>Business</strong> account linked to the Page. Posts go out
            there automatically; you can change or delete anything.
          </p>
          <Button href="/connect/meta" size="lg" className="self-start" icon={<FacebookIcon />}>
            Connect Facebook & Instagram
          </Button>
        </>
      ) : (
        <Alert tone="info" title="Retexia connects your accounts for you">
          Send us your Facebook Page and Instagram and we connect them, usually the same day. They show up here once they are connected.
          {waHref ? (
            <span className="mt-2 block">
              <Button href={waHref} size="sm" variant="secondary" target="_blank">
                Message us on WhatsApp
              </Button>
            </span>
          ) : null}
        </Alert>
      )}
    </Card>
  );

  const brandStep = (
    <Card className="flex flex-col gap-4">
      <p className="type-body text-ink-muted">
        Your logo, colours and a short &ldquo;About your business&rdquo; (we filled it in from your order: check it), then the products with prices. Posts only use
        what you add here.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button href="/brand?welcome=1">Check my brand</Button>
        <Button href="/products" variant="secondary">
          Add products
        </Button>
        <Button href="/" variant="ghost">
          Finish: go to my playlist
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <PageHeader title={`Welcome, ${business.name}`} description="A few quick steps and your first posts are on their way. You can change everything later in Playlist and settings." />
      <StartWizard
        settings={settings}
        limits={limits}
        whatsAppReady={whatsAppConfigured()}
        canTestWhatsApp={whatsAppConfigured()}
        done={{
          playlist: Boolean(settings.setup?.playlist),
          whatsapp: Boolean(settings.setup?.whatsapp),
          accounts: connected.length > 0,
          brand: Boolean((business.brand_brief || brand.logo_path || brand.colors?.length) && (products ?? 0) > 0),
        }}
        connect={connect}
        brand={brandStep}
      />
    </div>
  );
}
