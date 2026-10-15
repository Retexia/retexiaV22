import { createServerClient } from "@retexia/supabase/server";
import { Alert, Badge, Button, Card } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { CheckCircle2 } from "lucide-react";
import { FacebookIcon } from "@/components/post/brand-icons";
import { canConnectMeta } from "@/lib/post/meta-connect";
import { requireBusinessPage } from "@/lib/post/session";

export const metadata = { title: "Get started" };

/** After the welcome screen: connect Facebook & Instagram (Meta login), then brand and products. */
export default async function StartPage() {
  const [{ business, customer, db }, main] = await Promise.all([
    requireBusinessPage("/start"),
    createServerClient().then((s) => s.from("site_settings").select("whatsapp_number").eq("id", 1).maybeSingle()),
  ]);
  const { data: accounts } = await db.from("social_accounts").select("platform, display_name, status").eq("business_id", business.id).eq("status", "connected");
  const connected = accounts ?? [];
  const wa = main.data?.whatsapp_number?.replace(/[^\d]/g, "");
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hi, please connect Facebook and Instagram to Retexia Post for ${business.name} (${customer.order.ref}).`)}` : null;

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6">
      <PageHeader title={`Welcome, ${business.name}`} description="Two quick steps and your first posts are on their way." />

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-h2 text-ink">1. Connect Facebook & Instagram</h2>
          {connected.length ? <Badge tone="success">Connected</Badge> : null}
        </div>
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

      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">2. Add your brand and products</h2>
        <p className="type-body text-ink-muted">Your logo, colours and a short &ldquo;About your business&rdquo;, then the products with prices. The AI only uses what you add here.</p>
        <div className="flex flex-wrap gap-3">
          <Button href="/brand?welcome=1" variant={connected.length ? "primary" : "secondary"}>
            Add my brand
          </Button>
          <Button href="/products" variant="ghost">
            Add products
          </Button>
          <Button href="/" variant="ghost">
            Go to my playlist
          </Button>
        </div>
      </Card>
    </div>
  );
}
