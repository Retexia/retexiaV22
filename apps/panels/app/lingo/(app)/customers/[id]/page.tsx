import { Card, StatusBadge, formatDate } from "@retexia/ui";
import { DescriptionList, PageHeader } from "@retexia/ui/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerControls } from "@/components/lingo/customer-controls";
import type { CustomerStats } from "@/lib/lingo/db.types";
import { LANG_LABEL, ORDER_STATUS, STAGE, displayName, money, stageOf } from "@/lib/lingo/labels";
import { requireLingoPage } from "@/lib/lingo/session";
import { daysSince as days } from "@/lib/time";

export const metadata = { title: "Customer" };


export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cid = Number(id);
  if (!Number.isSafeInteger(cid) || cid <= 0) notFound();
  const { tenant, db } = await requireLingoPage(`/customers/${cid}`);
  const { data: c } = await db.from("customers").select("*").eq("id", cid).eq("lingo_user_id", tenant.id).maybeSingle();
  if (!c) notFound();
  const [stats, { data: orders }, { data: products }, { data: summary }] = await Promise.all([
    db.rpc("panel_customer_stats", { p_user: tenant.id }),
    db.from("orders").select("*").eq("customer_id", cid).eq("lingo_user_id", tenant.id).order("created_at", { ascending: false }),
    db.from("products").select("id, product_name, price").eq("lingo_user_id", tenant.id),
    db.from("messages").select("content, created_at").eq("customer_id", cid).eq("lingo_user_id", tenant.id).eq("role", "summary").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const s = ((stats.data ?? []) as CustomerStats[]).find((x) => Number(x.customer_id) === cid);
  const stage = stageOf(c, s);
  const names = new Map((products ?? []).map((p) => [p.id, p.product_name]));
  const seen = (c.seen_products ?? []).map((p) => names.get(p)).filter(Boolean) as string[];
  const name = displayName(c);
  const first = name.split(" ")[0];

  // Plain-language analysis built from the numbers (no chat content).
  const lines = [
    `${first} first messaged ${days(c.created_at) === 0 ? "today" : `${days(c.created_at)} days ago`}${c.last_customer_msg_at ? ` and was last in touch ${days(c.last_customer_msg_at) === 0 ? "today" : `${days(c.last_customer_msg_at)} days ago`}` : ""}, sending ${s?.user_messages ?? 0} message${s?.user_messages === 1 ? "" : "s"}.`,
    seen.length ? `Looked at ${seen.length} product${seen.length === 1 ? "" : "s"}: ${seen.slice(0, 5).join(", ")}${seen.length > 5 ? "…" : ""}.` : "Hasn't asked about a specific product yet.",
    s?.confirmed_orders ? `Ordered ${s.confirmed_orders} time${s.confirmed_orders === 1 ? "" : "s"}, spending ${money(s.spent)} in total.` : s?.orders ? "Started an order but never confirmed it." : "No orders yet.",
    stage === "about_to_order" ? "A good moment to message them: they were close to ordering." : stage === "cancelled" ? "Their last order was cancelled; a short personal message could win them back." : stage === "repeat" ? "A loyal customer. Worth a thank-you or an early offer." : null,
    c.language ? `Prefers ${LANG_LABEL[c.language]}.` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: "/customers", label: "Customers" }} title={name} description={c.number ? `+${c.number}` : undefined} chips={<StatusBadge tone={STAGE[stage].tone} label={STAGE[stage].label} />} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <h2 className="type-h2 text-ink">In short</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body text-ink">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {summary?.content ? (
              <div className="rounded-md bg-surface-sunk p-3">
                <p className="mb-1 type-caption text-ink-muted">Lingo&apos;s note ({formatDate(summary.created_at)})</p>
                <p className="type-small whitespace-pre-line text-ink">{summary.content.slice(0, 700)}</p>
              </div>
            ) : null}
          </Card>
          <Card padded={false}>
            <h2 className="border-b border-line px-5 py-3 type-h3 text-ink">Orders</h2>
            {(orders ?? []).length ? (
              <ul className="divide-y divide-line">
                {(orders ?? []).map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders?status=all&open=${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-sunk focus-visible:focus-ring">
                      <span className="type-label text-ink">
                        #{o.id} {o.product_name} × {o.quantity}
                      </span>
                      <span className="flex items-center gap-3 type-small text-ink-muted">
                        {money(o.total_price)} · {formatDate(o.created_at)}
                        <StatusBadge tone={ORDER_STATUS[o.status].tone} label={ORDER_STATUS[o.status].label} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center type-body text-ink-muted">No orders yet.</p>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <h2 className="type-h3 text-ink">Details</h2>
            <DescriptionList
              items={[
                { label: "WhatsApp name", value: c.whatsapp_name },
                { label: "Name for delivery", value: c.customer_name },
                { label: "Delivery address", value: c.address },
                { label: "Delivery phone", value: c.delivery_phone },
                { label: "Language", value: c.language ? LANG_LABEL[c.language] : null },
                { label: "Customer since", value: formatDate(c.created_at) },
              ]}
            />
          </Card>
          <CustomerControls id={c.id} number={c.number} paused={c.bot_paused} />
        </div>
      </div>
    </div>
  );
}
