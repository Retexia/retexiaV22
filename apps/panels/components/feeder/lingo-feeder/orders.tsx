"use client";

import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Textarea } from "@retexia/ui";
import { Download, Package } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveOrder, setOrderSent, setOrderStatus } from "@/app/feeder/(app)/lingo-feeder/actions";
import type { Order } from "@/lib/feeder/lingo-feeder/data";
import { lkr, showPhone, when } from "@/lib/feeder/lingo-feeder/labels";
import { useAction } from "./common";

const VIEWS = [
  { key: "new", label: "New (not in a courier file)" },
  { key: "sent", label: "Downloaded" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

function EditOrder({ o, onClose }: { o: Order; onClose: () => void }) {
  const [v, setV] = useState({ name: o.name ?? "", address: o.address ?? "", phone1: o.phone1 ?? "", phone2: o.phone2 ?? "", qty: String(o.qty) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, go } = useAction();
  return (
    <Dialog open onOpenChange={(x) => (!x ? onClose() : null)} title={`Order #${o.id}`} description={`${o.product_name} · ${lkr(o.unit_price)} each + delivery ${lkr(o.delivery_fee)}`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await go(() => saveOrder({ id: o.id, ...v }));
          setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
          if (r.ok) onClose();
        }}
      >
        <Field label="Name" required error={errors.name}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} /></Field>
        <Field label="Address" required error={errors.address}><Textarea rows={2} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} maxLength={300} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Phone" required error={errors.phone1}><Input value={v.phone1} onChange={(e) => setV({ ...v, phone1: e.target.value })} inputMode="tel" /></Field>
          <Field label="Phone 2" error={errors.phone2}><Input value={v.phone2} onChange={(e) => setV({ ...v, phone2: e.target.value })} inputMode="tel" /></Field>
          <Field label="Quantity" required error={errors.qty}><Input type="number" min={1} max={20} value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
          <Button type="submit" disabled={pending}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function OrdersView({ view, orders, newCount }: { view: string; orders: Order[]; newCount: number }) {
  const router = useRouter();
  const { pending, go } = useAction();
  const [edit, setEdit] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/lingo-feeder/orders/csv?kind=courier", { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(j?.error ?? "Couldn't make the file.");
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "orders.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${res.headers.get("x-lingo-orders") ?? ""} orders downloaded. Upload the file in Feeder → Bulk create.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="type-label text-ink">{newCount} new order{newCount === 1 ? "" : "s"} for the courier</p>
          <p className="type-small text-ink-muted">Download them as Feeder&apos;s courier file, then upload it in Feeder → Bulk create. Each order goes in one file only.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={download} disabled={busy || !newCount}>
            <Download aria-hidden size={16} strokeWidth={1.75} /> {busy ? "Making the file…" : "Download courier file"}
          </Button>
          <Button href="/lingo-feeder/orders/csv?kind=all" variant="ghost" target="_self">All orders (CSV)</Button>
        </div>
      </Card>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
        {VIEWS.map((x) => (
          <Link
            key={x.key}
            href={`/lingo-feeder/orders${x.key === "new" ? "" : `?view=${x.key}`}`}
            aria-current={view === x.key ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 type-small focus-visible:focus-ring ${view === x.key ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface-raised text-ink-muted hover:text-ink"}`}
          >
            {x.label}
          </Link>
        ))}
      </div>
      {orders.length ? (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="type-label text-ink">{o.product_name} × {o.qty} <span className="text-ink-muted">· {lkr(o.total)}</span></p>
                    <p className="type-body text-ink">{o.name}</p>
                    <p className="type-small text-ink-muted">{o.address}</p>
                    <p className="type-small text-ink-muted">📞 {[o.phone1, o.phone2].filter(Boolean).join(" / ")} · WhatsApp {showPhone(o.phone)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={o.status === "cancelled" ? "neutral" : o.exported_at ? "success" : "warning"}>{o.status === "cancelled" ? "Cancelled" : o.exported_at ? "In a courier file" : "New"}</Badge>
                    <span className="type-small text-ink-muted">#{o.id} · {when(o.confirmed_at ?? o.created_at)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" href={`/lingo-feeder/chats/${o.phone}`}>Open chat</Button>
                  {o.status === "confirmed" ? <Button size="sm" variant="ghost" onClick={() => setEdit(o)}>Edit</Button> : null}
                  {o.status === "confirmed" ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(() => setOrderSent({ id: o.id, sent: !o.exported_at }))}>{o.exported_at ? "Put back in the next file" : "Mark as sent"}</Button>
                  ) : null}
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (o.status === "cancelled" || confirm("Cancel this order?")) void go(() => setOrderStatus({ id: o.id, status: o.status === "cancelled" ? "confirmed" : "cancelled" })); }}>
                    {o.status === "cancelled" ? "Undo cancel" : "Cancel order"}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Package aria-hidden size={22} strokeWidth={1.5} />} title={view === "new" ? "No new orders" : "Nothing here"}>
          {view === "new" ? "Confirmed orders from Lingo appear here, ready for the courier file." : "Orders appear here when they match this view."}
        </EmptyState>
      )}
      {edit ? <EditOrder o={edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}
