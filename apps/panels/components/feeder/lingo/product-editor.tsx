"use client";

import { Button, Card, Field, Input, Switch, Textarea } from "@retexia/ui";
import { useState } from "react";
import { saveProduct } from "@/app/feeder/(app)/lingo/actions";
import type { ProductItem } from "@/lib/feeder/lingo/data";
import { chars, money } from "@/lib/feeder/lingo/labels";
import { useAction, WaBubble } from "./common";

type Key = "product_name" | "short_description" | "long_description" | "ingredients" | "application" | "precautions" | "symptoms" | "aliases" | "picture_url";
const FIELDS: { key: Key; label: string; hint: string; rows?: number; shared?: keyof NonNullable<ProductItem["shared"]> }[] = [
  { key: "product_name", label: "Name", hint: "As customers know it." },
  { key: "picture_url", label: "Photo link", hint: "A public https:// link (WhatsApp downloads it).", shared: "picture_url" },
  { key: "long_description", label: "Long description", hint: "The first message (photo caption). Use {price} and {delivery_fee} so prices are always right. Max 1,024 characters for one message.", rows: 6, shared: "long_description" },
  { key: "short_description", label: "Short info", hint: "One line: what it's for. Used in menus and answers.", shared: "short_description" },
  { key: "application", label: "How to use", hint: "Lingo answers \"how do I use it\" only from this.", rows: 3, shared: "application" },
  { key: "precautions", label: "Precautions", hint: "Lingo answers \"is it safe…\" only from this.", rows: 3, shared: "precautions" },
  { key: "ingredients", label: "Ingredients", hint: "", rows: 2, shared: "ingredients" },
  { key: "symptoms", label: "Problems it helps with", hint: "Words customers use, comma separated (sugar, pressure…). Helps Lingo find the product.", shared: "symptoms" },
  { key: "aliases", label: "Other names", hint: "Comma separated, incl. Sinhala and Singlish spellings.", shared: "aliases" },
];

export function ProductEditor({ product, askDetails }: { product: ProductItem; askDetails: string }) {
  const own = product.own;
  const [v, setV] = useState<Record<Key, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(own?.[f.key] ?? "")])) as Record<Key, string>);
  const [price, setPrice] = useState(own && Number(own.price) > 0 ? String(own.price) : "");
  const [delivery, setDelivery] = useState(own?.delivery_fee != null ? String(own.delivery_fee) : "");
  const [active, setActive] = useState(own?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, go } = useAction();

  const effective = (f: (typeof FIELDS)[number]) => v[f.key].trim() || (f.shared ? String(product.shared?.[f.shared] ?? "") : "") || (f.key === "product_name" ? product.name : "");
  const p = Number(price || product.price);
  const d = Number(delivery || product.delivery_fee);
  const caption = effective(FIELDS[2]!).replace(/\{price\}/g, p.toLocaleString("en-US")).replace(/\{delivery_fee\}/g, d.toLocaleString("en-US")).replace(/\{total\}/g, (p + d).toLocaleString("en-US")).replace(/\{product\}/g, effective(FIELDS[0]!));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await go(() => saveProduct({ id: product.id, ...v, price: price || "0", delivery_fee: delivery, active }));
          setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
        }}
      >
        <Card className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your price (Rs.)" hint={`Empty = your price list (${money(product.own && Number(product.own.price) > 0 ? product.price : product.price)})`} error={errors.price}>
              <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={String(product.price)} />
            </Field>
            <Field label="Delivery fee (Rs.)" hint={`Empty = Feeder's (${money(product.delivery_fee)})`} error={errors.delivery_fee}>
              <Input type="number" min={0} step="0.01" value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder={String(product.delivery_fee)} />
            </Field>
          </div>
          <Switch checked={active} onCheckedChange={setActive} label="Lingo sells this product" description="Off = Lingo doesn't offer it or match it to ads." />
        </Card>
        <Card className="flex flex-col gap-4">
          <p className="type-small text-ink-muted">Empty fields use Retexia&apos;s shared text for this Feeder product (shown in grey). Write your own to replace it for your shop only.</p>
          {FIELDS.map((f) => {
            const shared = f.shared ? String(product.shared?.[f.shared] ?? "") : "";
            const count = chars(v[f.key] || shared);
            return (
              <Field key={f.key} label={f.label} hint={`${f.hint}${f.key === "long_description" ? ` (${count}/1,024)` : ""}`} error={errors[f.key]}>
                {f.rows ? (
                  <Textarea rows={f.rows} value={v[f.key]} placeholder={shared || undefined} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                ) : (
                  <Input value={v[f.key]} placeholder={shared || (f.key === "product_name" ? product.name : undefined)} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                )}
              </Field>
            );
          })}
          <Button type="submit" disabled={pending} className="self-start">Save product</Button>
        </Card>
      </form>
      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <h2 className="type-h3 text-ink">What customers get first</h2>
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunk p-3">
          <WaBubble image={effective(FIELDS[1]!) || null} text={Array.from(caption).length <= 1024 ? caption : undefined} />
          {Array.from(caption).length > 1024 ? <WaBubble text={caption} /> : null}
          <WaBubble text={askDetails} />
        </div>
        <p className="type-small text-ink-muted">The photo with the long description, then the request for name, address and phone number.</p>
      </aside>
    </div>
  );
}
