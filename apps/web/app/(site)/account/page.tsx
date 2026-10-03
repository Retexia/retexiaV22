import { Alert, Badge, Button, Card, EmptyState, productStyle } from "@retexia/ui";
import { Icon } from "@retexia/ui/icon";
import type { Metadata } from "next";
import { OrderCard } from "@/components/account/order-card";
import { firstName, requireUser } from "@/lib/auth";
import { getOrderStatuses, getProducts, getSiteSettings, productHref } from "@/lib/content";
import { whatsappHref } from "@/lib/links";
import { getMyOrders } from "@/lib/orders";
import { getT } from "@/lib/strings.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.overview.title", "Your account") };
}

export default async function AccountOverview({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams;
  const [{ supabase, user, profile }, settings, products, statuses, t] = await Promise.all([
    requireUser("/account"),
    getSiteSettings(),
    getProducts(),
    getOrderStatuses(),
    getT(),
  ]);
  const orders = await getMyOrders(supabase);

  // Latest order per product
  const latest = new Map<string, (typeof orders)[number]>();
  for (const o of orders) if (!latest.has(o.product_id)) latest.set(o.product_id, o);
  const explore = products.filter((p) => !latest.has(p.id));
  const name = firstName(profile, user.email);
  const incomplete = !profile?.phone || !profile?.business_name;
  const wa = whatsappHref(settings);

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1 className="type-h1 text-ink">
          {name ? t("account.overview.greeting", "Hello, {name}", { name }) : t("account.overview.title", "Your account")}
        </h1>
        <p className="type-body-lg text-ink-muted">{t("account.overview.subtitle", "Your products, requests and details in one place.")}</p>
      </header>

      {sp.password_updated === "1" ? <Alert tone="success">{t("account.password_updated", "Your password was updated.")}</Alert> : null}
      {sp.email_changed === "1" ? <Alert tone="success">{t("account.email_changed", "Your email address was updated.")}</Alert> : null}

      {incomplete ? (
        <Alert
          tone="info"
          title={t("account.profile_incomplete.title", "Complete your profile")}
          action={
            <Button href="/account/profile" variant="secondary" size="sm">
              {t("account.profile_incomplete.action", "Add details")}
            </Button>
          }
        >
          {t("account.profile_incomplete.text", "Add your phone number and business name so we can set things up faster.")}
        </Alert>
      ) : null}

      <section aria-labelledby="your-products" className="flex flex-col gap-4">
        <h2 id="your-products" className="type-h2 text-ink">
          {t("account.overview.your_products", "Your products")}
        </h2>
        {latest.size ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...latest.values()].map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                product={products.find((p) => p.id === o.product_id)}
                status={statuses.find((s) => s.key === o.status)}
                settings={settings}
                t={t}
              />
            ))}
          </div>
        ) : (
          <Card padded={false}>
            <EmptyState
              icon={<Icon name="package" size={24} />}
              title={t("account.empty.title", "You have no products yet")}
              actions={
                <Button href="/products">{t("account.empty.action", "Browse products")}</Button>
              }
            >
              {t("account.empty.text", "Pick a tool and we will set it up for you. It takes about ten minutes to get started.")}
            </EmptyState>
          </Card>
        )}
      </section>

      {explore.length ? (
        <section aria-labelledby="explore" className="flex flex-col gap-4">
          <h2 id="explore" className="type-h2 text-ink">
            {t("account.overview.explore", "Explore more products")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {explore.map((p) => {
              const live = p.status === "live";
              return (
                <Card key={p.id} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full" style={productStyle(p.slug)}>
                      <Icon name={p.icon} fallback="box" size={20} />
                    </span>
                    {!live ? <Badge>{t("product.status.coming_soon", "Coming soon")}</Badge> : null}
                  </div>
                  <h3 className="type-h2 text-ink">{p.name}</h3>
                  {p.tagline ? <p className="type-body text-ink-muted">{p.tagline}</p> : null}
                  <div className="mt-auto pt-2">
                    <Button href={live ? productHref(p) : `${productHref(p)}#waitlist`} variant="secondary" size="sm">
                      {live ? t("product.learn_more", "Learn more") : t("product.join_waitlist", "Join the waitlist")}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <Card as="section" aria-labelledby="help" className="flex flex-col gap-4 bg-surface-sunk! sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="help" className="type-h2 text-ink">
            {t("account.help.title", "Need a hand?")}
          </h2>
          <p className="type-body text-ink-muted">{t("account.help.text", "Message us any time. A real person will reply.")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {wa ? (
            <Button href={wa} size="sm" icon={<Icon name="message-circle" size={16} />}>
              {t("contact.whatsapp_button", "Message us on WhatsApp")}
            </Button>
          ) : null}
          {settings.contact_email ? (
            <Button href={`mailto:${settings.contact_email}`} variant="secondary" size="sm">
              {settings.contact_email}
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
