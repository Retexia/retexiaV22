import { Alert, Card, ProductChip, StatusBadge, formatDate, formatPrice, type Tone } from "@retexia/ui";
import { DescriptionList, PageHeader } from "@retexia/ui/admin";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Customer's view" };

/**
 * What the customer sees on retexia.com/account/products/[ref], rendered here
 * from the same data (no impersonation, no customer session).
 */
export default async function CustomerViewPage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref);
  const { supabase } = await requireStaffPage("view");
  const { data: order } = await supabase.from("staff_orders").select("*").eq("ref", ref).maybeSingle();
  if (!order?.id) notFound();
  const [statuses, events, payments, fields] = await Promise.all([
    supabase.from("order_statuses").select("key, label, description, tone").order("sort_order"),
    supabase.from("order_events").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
    supabase.from("payments").select("*").eq("order_id", order.id).in("status", ["confirmed", "refunded", "pending"]).order("created_at", { ascending: false }),
    supabase.from("product_service_fields").select("key, label, type").eq("product_id", order.product_id ?? "").eq("visible_to_customer", true).neq("type", "secret").order("sort_order"),
  ]);
  const label = (k: string | null) => statuses.data?.find((s) => s.key === k)?.label ?? k ?? "";
  const current = statuses.data?.find((s) => s.key === order.status);
  const currency = order.currency ?? "USD";
  const data = (order.service_data ?? {}) as Record<string, unknown>;
  const visible = (fields.data ?? []).filter((f) => data[f.key] !== undefined && String(data[f.key]).trim() !== "");
  const dueNow = Number(order.setup_fee ?? 0) + Number(order.price_amount ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: `/requests/${encodeURIComponent(ref)}`, label: ref }} title="Customer's view" description="A read-only copy of the customer's order page on retexia.com." />
      <Alert tone="info">Preview only. Nothing here changes the request.</Alert>
      <div className="mx-auto flex w-full max-w-content flex-col gap-6 rounded-lg border border-dashed border-line-strong p-6">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {order.product_slug ? <ProductChip slug={order.product_slug} name={order.product_short_name ?? ""} size="sm" /> : null}
            <StatusBadge tone={(current?.tone as Tone) ?? "neutral"} label={current?.label ?? order.status ?? ""} />
            <span className="type-code text-ink-muted">{ref}</span>
          </div>
          <h2 className="type-h1 text-ink">{order.package_name}</h2>
          {current?.description ? <p className="type-body-lg text-ink-muted">{current.description}</p> : null}
          {order.status === "active" && order.renews_at ? <p className="type-body text-ink">Renews on {formatDate(order.renews_at)}</p> : null}
        </header>
        {order.status === "awaiting_payment" ? (
          <Card className="flex flex-col gap-3">
            <h3 className="type-h2 text-ink">Pay to start</h3>
            <p className="type-body text-ink">
              The customer sees a <strong>Pay now</strong> button that opens Paddle&apos;s checkout for <strong>{formatPrice(dueNow, currency)}</strong> (first period
              {Number(order.setup_fee ?? 0) > 0 ? " and setup fee" : ""}, plus tax where it applies).
            </p>
          </Card>
        ) : null}
        {visible.length ? (
          <Card className="flex flex-col gap-3">
            <h3 className="type-h2 text-ink">Your setup</h3>
            <DescriptionList items={visible.map((f) => ({ label: f.label, value: f.type === "date" ? formatDate(String(data[f.key])) : String(data[f.key]) }))} />
          </Card>
        ) : null}
        <Card className="flex flex-col gap-3">
          <h3 className="type-h2 text-ink">Timeline</h3>
          <ol className="flex flex-col gap-4 border-l border-line pl-6">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5">
                <span className="type-label text-ink">{label(e.to_status)}</span>
                <span className="type-small text-ink-muted">{formatDate(e.created_at, "en-LK", true)}</span>
                {e.note ? <p className="type-body text-ink-muted">{e.note}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
        {(payments.data ?? []).length ? (
          <Card className="flex flex-col gap-3">
            <h3 className="type-h2 text-ink">Payments</h3>
            <ul className="flex flex-col gap-2">
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="flex justify-between gap-3 type-body">
                  <span>
                    {formatPrice(p.amount, p.currency ?? currency)} · {p.status === "pending" ? "Proof received, being checked" : p.status}
                  </span>
                  {p.receipt_number ? <span className="type-code text-ink-muted">{p.receipt_number}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
