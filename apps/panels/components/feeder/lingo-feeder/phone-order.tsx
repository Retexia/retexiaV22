"use client";

import { Button, Card, Field, Input, Select, Textarea } from "@retexia/ui";
import { PhoneCall } from "lucide-react";
import { useState } from "react";
import { addPhoneOrder } from "@/app/feeder/(app)/lingo-feeder/actions";
import { lkr } from "@/lib/feeder/lingo-feeder/labels";
import { useAction } from "./common";

type Item = { id: number; name: string; price: number; delivery_fee: number };

/**
 * For customers who don't text back after the first message: call them, fill this in, press Send.
 * The order is saved as confirmed and they get a WhatsApp thank-you with their details.
 */
export function PhoneOrder({
  phone, productId, details, profileName, catalog, windowOpen,
}: {
  phone: string; productId: number | null; details: { name?: string; address?: string; phone?: string; phone2?: string } | null; profileName: string | null;
  catalog: Item[]; windowOpen: boolean;
}) {
  const { pending, go } = useAction();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState({
    product_id: String(productId ?? ""),
    qty: "1",
    name: details?.name ?? profileName ?? "",
    address: details?.address ?? "",
    phone1: details?.phone ?? `0${phone.replace(/^94/, "")}`,
    phone2: details?.phone2 ?? "",
  });
  const item = catalog.find((p) => String(p.id) === v.product_id);
  const total = item ? item.price * (Number(v.qty) || 1) + item.delivery_fee : null;

  if (!open) {
    return (
      <Card className="flex flex-col gap-2">
        <h3 className="type-label text-ink">Took the order on a call?</h3>
        <p className="type-small text-ink-muted">Fill in their details and send: the order is saved, and they get a WhatsApp thank-you with their details.</p>
        <Button size="sm" variant="secondary" className="self-start" onClick={() => setOpen(true)}>
          <PhoneCall aria-hidden size={14} strokeWidth={1.75} /> Add the order
        </Button>
      </Card>
    );
  }
  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await go(() => addPhoneOrder({ phone, ...v, product_id: Number(v.product_id), qty: Number(v.qty) }));
          setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
          if (r.ok) setOpen(false);
        }}
      >
        <h3 className="type-label text-ink">Order taken by phone</h3>
        <Field label="Product" required error={errors.product_id}>
          <Select value={v.product_id} onChange={(e) => setV({ ...v, product_id: e.target.value })} placeholder="Choose the product" options={catalog.map((p) => ({ value: String(p.id), label: p.name }))} />
        </Field>
        <Field label="Quantity" required error={errors.qty}>
          <Input inputMode="numeric" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
        </Field>
        <Field label="Name" required error={errors.name}>
          <Input value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Address" required hint="House number, street, town" error={errors.address}>
          <Textarea rows={2} value={v.address} maxLength={300} onChange={(e) => setV({ ...v, address: e.target.value })} />
        </Field>
        <Field label="Phone" required error={errors.phone1}>
          <Input inputMode="tel" value={v.phone1} onChange={(e) => setV({ ...v, phone1: e.target.value })} />
        </Field>
        <Field label="Second phone" error={errors.phone2}>
          <Input inputMode="tel" value={v.phone2} onChange={(e) => setV({ ...v, phone2: e.target.value })} />
        </Field>
        {total != null ? <p className="type-small text-ink">Total {lkr(total)} (with delivery {lkr(item!.delivery_fee)}), cash on delivery.</p> : null}
        {!windowOpen ? <p className="type-small text-warning">More than 24 hours since their last message: the order is saved, but WhatsApp won&apos;t let us send the thank-you.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pending}>{windowOpen ? "Save and send" : "Save the order"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
