import { Button, Card, EmptyState, ProductChip } from "@retexia/ui";
import { Icon } from "@retexia/ui/icon";
import type { Metadata } from "next";
import { OrderCard } from "@/components/account/order-card";
import { OrdersFilter, type FilterKey } from "@/components/account/orders-filter";
import { requireUser } from "@/lib/auth";
import { getOrderStatuses, getProducts, getSiteSettings } from "@/lib/content";
import { getMyOrders, orderGroup, type CustomerOrder } from "@/lib/orders";
import { getT } from "@/lib/strings.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.products.title", "My products") };
}

export default async function MyProductsPage() {
  const [{ supabase }, settings, products, statuses, t] = await Promise.all([
    requireUser("/account/products"),
    getSiteSettings(),
    getProducts(),
    getOrderStatuses(),
    getT(),
  ]);
  const orders = await getMyOrders(supabase);

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="type-h1 text-ink">{t("account.products.title", "My products")}</h1>
      <p className="type-body-lg text-ink-muted">{t("account.products.subtitle", "Every request and subscription, grouped by product.")}</p>
    </header>
  );

  if (!orders.length) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <Card padded={false}>
          <EmptyState
            icon={<Icon name="package" size={24} />}
            title={t("account.empty.title", "You have no products yet")}
            actions={<Button href="/products">{t("account.empty.action", "Browse products")}</Button>}
          >
            {t("account.empty.text", "Pick a tool and we will set it up for you. It takes about ten minutes to get started.")}
          </EmptyState>
        </Card>
      </div>
    );
  }

  const groupOf = (o: CustomerOrder) => orderGroup(o.status, statuses.find((s) => s.key === o.status)?.is_final ?? false);
  const keys: FilterKey[] = ["all", "active", "in_progress", "closed"];
  const counts = Object.fromEntries(keys.map((k) => [k, orders.filter((o) => k === "all" || groupOf(o) === k).length])) as Record<FilterKey, number>;

  const renderGroup = (filter: FilterKey) => {
    const list = orders.filter((o) => filter === "all" || groupOf(o) === filter);
    if (!list.length) {
      return <p className="py-8 text-center type-body text-ink-muted">{t("account.filter.empty", "Nothing here right now.")}</p>;
    }
    const byProduct = new Map<string, CustomerOrder[]>();
    for (const o of list) byProduct.set(o.product_id, [...(byProduct.get(o.product_id) ?? []), o]);
    return (
      <div className="flex flex-col gap-10">
        {[...byProduct.entries()].map(([productId, items]) => {
          const product = products.find((p) => p.id === productId);
          return (
            <section key={productId} aria-label={product?.name} className="flex flex-col gap-4">
              {product ? (
                <ProductChip slug={product.slug} name={product.name} icon={<Icon name={product.icon} fallback="box" size={16} />} className="self-start" />
              ) : null}
              <div className="grid gap-4 lg:grid-cols-2">
                {items.map((o) => (
                  <OrderCard key={o.id} order={o} product={product} status={statuses.find((s) => s.key === o.status)} settings={settings} t={t} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {header}
      <OrdersFilter
        counts={counts}
        panels={{
          all: renderGroup("all"),
          active: renderGroup("active"),
          in_progress: renderGroup("in_progress"),
          closed: renderGroup("closed"),
        }}
      />
    </div>
  );
}
