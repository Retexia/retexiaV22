import { can } from "@retexia/supabase";
import { Badge, Button, Card, formatDate, formatPrice } from "@retexia/ui";
import { DescriptionList, PageHeader, StatCard } from "@retexia/ui/admin";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth";
import { LingoConnectionCard, LingoOwnerCard, LingoSettingsCard } from "@/products/lingo/account-editor";
import { getLingoAccount } from "@/products/lingo/data";

export const metadata = { title: "Lingo bot account" };

const ORDER_TONE = { confirmed: "warning", processing: "warning", shipped: "brand", delivered: "success", cancelled: "neutral" } as const;

export default async function LingoAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("operate");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const data = await getLingoAccount(id);
  if (!data) notFound();
  const { account, owner, stats, orders, products, details } = data;
  const canAdmin = can(staff.role, "manageSettings");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/products/lingo?tab=accounts", label: "Bot accounts" }}
        title={account.business_name}
        description={`Lingo bot #${account.id} · WhatsApp instance ${account.evolution_instance} · since ${formatDate(account.created_at)}`}
        chips={<Badge tone={account.active ? "success" : "neutral"}>{account.active ? "Answering" : "Off"}</Badge>}
        actions={
          <Button href={process.env.NEXT_PUBLIC_LINGO_URL || "https://lingo.retexia.com"} target="_blank" variant="secondary" size="sm" iconAfter={<ExternalLink aria-hidden size={14} strokeWidth={1.5} />}>
            Customer panel
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Customers" value={stats.customers.toLocaleString("en-LK")} hint={`${stats.new_customers_30d} new in 30 days`} />
        <StatCard label="Customer messages (30 days)" value={stats.messages_30d.toLocaleString("en-LK")} hint={stats.last_message_at ? `Last ${formatDate(stats.last_message_at, "en-LK", true)}` : "No messages yet"} />
        <StatCard label="Orders (30 days)" value={stats.orders_30d} hint={`${stats.open_orders} waiting to be sent`} tone={stats.open_orders > 5 ? "warning" : "neutral"} />
        <StatCard label="Sales (30 days)" value={formatPrice(stats.sales_30d, "LKR")} hint={`${stats.products} products on sale`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <LingoSettingsCard account={account} />
          <LingoConnectionCard account={account} canAdmin={canAdmin} />
          <Card className="flex flex-col gap-4">
            <h2 className="type-h3 text-ink">Latest orders</h2>
            {orders.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="type-body text-ink">
                      {o.product_name ?? "Product"} × {o.quantity}
                      <span className="block type-small text-ink-muted">
                        {o.customer_name ?? "Customer"} · {formatDate(o.created_at, "en-LK", true)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{formatPrice(o.total_price, "LKR")}</span>
                      <Badge tone={ORDER_TONE[o.status as keyof typeof ORDER_TONE] ?? "neutral"}>{o.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body text-ink-muted">No orders yet.</p>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <LingoOwnerCard account={account} owner={owner} canAdmin={canAdmin} />
          <Card className="flex flex-col gap-3">
            <h2 className="type-h3 text-ink">Business details</h2>
            {details ? (
              <DescriptionList
                items={[
                  { label: "Type", value: details.business_type || "—" },
                  { label: "Address", value: details.address || "—" },
                  { label: "Phone", value: details.contact_phone || "—" },
                  { label: "Delivers to", value: details.delivery_areas || "—" },
                  { label: "Payments", value: details.payment_methods || "—" },
                ]}
              />
            ) : (
              <p className="type-body text-ink-muted">Not filled in yet. The customer fills these in their panel.</p>
            )}
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="type-h3 text-ink">Products ({products.length})</h2>
            {products.length ? (
              <ul className="flex flex-col gap-1.5">
                {products.slice(0, 30).map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 type-small">
                    <span className={p.active ? "text-ink" : "text-ink-muted line-through"}>{p.product_name}</span>
                    <span className="tabular-nums text-ink-muted">{formatPrice(p.price, "LKR")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body text-ink-muted">No products yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
