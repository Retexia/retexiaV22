"use client";

import { Badge, Button, Card, EmptyState, Input, Select, Switch } from "@retexia/ui";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { setAdProduct, setProduct } from "@/app/feeder/(app)/lingo-feeder/actions";
import type { Ad, Product } from "@/lib/feeder/lingo-feeder/data";
import { lkr, timeAgo } from "@/lib/feeder/lingo-feeder/labels";
import { useAction } from "./common";

const fill = (s: string, p: Product) => s.replace(/\{price\}/g, p.price.toLocaleString("en-US")).replace(/\{delivery_fee\}/g, p.delivery_fee.toLocaleString("en-US")).replace(/\{total\}/g, p.total.toLocaleString("en-US"));

function ProductRow({ p }: { p: Product }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(p.own_price ? String(p.own_price) : "");
  const { pending, go } = useAction();
  return (
    <li className="flex flex-col gap-3 py-3">
      <div className="flex items-start gap-3">
        {p.picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- public product photo
          <img src={p.picture_url} alt="" className="size-12 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-surface-sunk type-small text-ink-muted">No photo</span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <button type="button" onClick={() => setOpen(!open)} className="text-left type-label text-ink hover:text-brand focus-visible:focus-ring">{p.name}</button>
          <p className="type-small text-ink-muted">
            {lkr(p.price)} + delivery {lkr(p.delivery_fee)} = {lkr(p.total)}{p.own_price ? " · your price" : ""}
          </p>
          {p.short_description ? <p className="line-clamp-1 type-small text-ink-muted">{p.short_description}</p> : null}
        </div>
        <Switch checked={p.enabled} disabled={pending} label={p.enabled ? "On" : "Off"} onCheckedChange={(x) => go(() => setProduct({ product_id: p.id, enabled: x, price: p.own_price }))} />
      </div>
      {open ? (
        <div className="flex flex-col gap-3 rounded-md bg-surface-sunk p-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); void go(() => setProduct({ product_id: p.id, enabled: p.enabled, price: price || null })); }}
          >
            <label className="flex flex-col gap-1 type-small text-ink">
              Your selling price (empty = Feeder price)
              <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(p.price)} className="w-40" />
            </label>
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>Save price</Button>
          </form>
          <p className="type-small text-ink-muted">What Lingo knows (the same for every seller; Retexia keeps it up to date):</p>
          {p.long_description ? <p className="whitespace-pre-wrap type-small text-ink">{fill(p.long_description, p)}</p> : null}
          {p.how_to_use ? <p className="type-small text-ink"><strong>How to use:</strong> {p.how_to_use}</p> : null}
          {p.precautions ? <p className="type-small text-ink"><strong>Precautions:</strong> {p.precautions}</p> : null}
          {p.benefits ? <p className="type-small text-ink"><strong>For:</strong> {p.benefits}</p> : null}
          {p.faqs?.length ? <p className="type-small text-ink"><strong>FAQs:</strong> {p.faqs.length}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

export function ProductsView({ products, ads }: { products: Product[]; ads: Ad[] }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "on" | "off">("all");
  const { pending, go } = useAction();
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => (only === "all" || (only === "on") === p.enabled) && (!s || `${p.name} ${p.aliases ?? ""} ${p.short_description ?? ""}`.toLowerCase().includes(s)));
  }, [products, q, only]);
  const options = useMemo(() => products.filter((p) => p.enabled).map((p) => ({ value: String(p.id), label: p.name })), [products]);
  const byId = new Map(products.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="type-h3 text-ink">Products Lingo sells</h2>
            <p className="type-small text-ink-muted">Every Feeder product, with its photo, description, how to use and precautions. Switch off what you don&apos;t sell, or set your own price.</p>
          </div>
          <Badge tone="neutral">{products.filter((p) => p.enabled).length} on</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search products" className="pl-9" />
          </div>
          <Select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label="Show" options={[{ value: "all", label: "All" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]} className="w-28" />
        </div>
        {shown.length ? (
          <ul className="flex flex-col divide-y divide-line">{shown.map((p) => <ProductRow key={p.id} p={p} />)}</ul>
        ) : (
          <EmptyState title="No products match">Try another word.</EmptyState>
        )}
      </Card>

      <Card id="ads" className="flex flex-col gap-3">
        <div>
          <h2 className="type-h3 text-ink">Your ads</h2>
          <p className="type-small text-ink-muted">Every Click-to-WhatsApp ad customers came from. Lingo finds the product from the ad itself; if she couldn&apos;t, pick it here once.</p>
        </div>
        {ads.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {ads.map((a) => (
              <li key={a.ad_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate type-label text-ink">{a.headline || a.body || a.ad_id}</p>
                  <p className="type-small text-ink-muted">
                    {a.chats + 1} chat{a.chats ? "s" : ""} · first {timeAgo(a.created_at)}
                    {a.product_id ? ` · ${a.matched_by === "seller" ? "picked by you" : "found by Lingo"}` : ""}
                  </p>
                </div>
                <Select
                  aria-label="Product for this ad"
                  value={a.product_id ? String(a.product_id) : ""}
                  disabled={pending}
                  placeholder={a.product_id ? undefined : "⚠️ Choose the product"}
                  onChange={(e) => go(() => setAdProduct({ ad_id: a.ad_id, product_id: e.target.value ? Number(e.target.value) : null }))}
                  options={a.product_id && !byId.get(a.product_id)?.enabled ? [{ value: String(a.product_id), label: byId.get(a.product_id)?.name ?? "Unknown" }, ...options] : options}
                  className="sm:w-72"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-small text-ink-muted">No ads yet. They appear after the first customer taps one.</p>
        )}
      </Card>
    </div>
  );
}
