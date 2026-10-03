import { Button, Card, ProductChip, StatusBadge, type Tone } from "@retexia/ui";
import { Icon } from "@retexia/ui/icon";
import type { OrderStatus, Product, SiteSettings } from "@/lib/content";
import { formatDate, formatPrice } from "@/lib/format";
import type { CustomerOrder } from "@/lib/orders";
import type { Translate } from "@/lib/strings";

export function canOpenPanel(product: Product | undefined, order: Pick<CustomerOrder, "status">) {
  return Boolean(product?.panel_live && product.panel_url && order.status === "active");
}

export function OrderCard({
  order,
  product,
  status,
  settings,
  t,
}: {
  order: CustomerOrder;
  product: Product | undefined;
  status: OrderStatus | undefined;
  settings: SiteSettings;
  t: Translate;
}) {
  const price = formatPrice(order.price_amount, order.currency ?? settings.currency_code, settings.currency_locale);
  const per = order.billing_cycle === "yearly" ? t("pricing.per_year", "/ year") : t("pricing.per_month", "/ month");
  const panel = canOpenPanel(product, order);
  return (
    <Card as="article" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {product ? (
          <ProductChip slug={product.slug} name={product.short_name} size="sm" icon={<Icon name={product.icon} fallback="box" size={14} />} />
        ) : (
          <span />
        )}
        <StatusBadge tone={(status?.tone as Tone) ?? "neutral"} label={status?.label ?? order.status} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="type-h2 text-ink">{order.package_name}</h3>
        <p className="type-body text-ink-muted">
          {price} {per}
        </p>
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 type-small text-ink-muted">
        <div className="flex gap-1.5">
          <dt>{t("order.ref", "Ref")}</dt>
          <dd className="type-code text-ink">{order.ref}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>{t("order.submitted", "Submitted")}</dt>
          <dd>{formatDate(order.created_at, settings.currency_locale)}</dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-wrap gap-3 pt-2">
        <Button href={`/account/products/${encodeURIComponent(order.ref ?? "")}`} variant="secondary" size="sm">
          {t("order.view_details", "View details")}
        </Button>
        {panel && product?.panel_url ? (
          <Button href={product.panel_url} size="sm">
            {t("order.open_panel", "Open {name} panel", { name: product.short_name })}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
