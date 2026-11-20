"use client";

import { Button, Card, Checkbox, Field, Input, Select, Switch, Textarea } from "@retexia/ui";
import { useState } from "react";
import { saveSettings } from "@/app/feeder/(app)/lingo/actions";
import type { Seller } from "@/lib/feeder/lingo/data";
import { useAction } from "./common";

const HOURS = Array.from({ length: 25 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));

export function SettingsForm({ seller }: { seller: Seller }) {
  const f = seller.followups ?? {};
  const [v, setV] = useState({
    business_name: seller.business_name,
    shop_phone: seller.shop_phone ?? "",
    shop_address: seller.shop_address ?? "",
    delivery_days: String(seller.delivery_days),
    default_lang: seller.default_lang,
    order_fields: seller.order_fields,
    batch_seconds: String(seller.batch_seconds),
    handoff_pause_hours: String(seller.handoff_pause_hours),
    reply_to_non_ad: seller.reply_to_non_ad,
    banned: seller.banned_claims.join("\n"),
    fu: { hours: String(f.hours ?? 5), from: String(f.from ?? 8), to: String(f.to ?? 21), confirmed: f.confirmed !== false, cancelled: f.cancelled !== false, no_order: f.no_order !== false },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, go } = useAction();
  const field = (k: "order_fields", x: string, on: boolean) => setV({ ...v, [k]: on ? [...v[k], x] : v[k].filter((y) => y !== x) });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await go(() =>
          saveSettings({
            business_name: v.business_name, shop_phone: v.shop_phone, shop_address: v.shop_address, delivery_days: v.delivery_days, default_lang: v.default_lang,
            order_fields: v.order_fields as ("name" | "address" | "contact")[], batch_seconds: v.batch_seconds, handoff_pause_hours: v.handoff_pause_hours,
            reply_to_non_ad: v.reply_to_non_ad, banned_claims: v.banned.split("\n").map((x) => x.trim()).filter(Boolean), followups: v.fu,
          }),
        );
        setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
      }}
    >
      <Card className="flex flex-col gap-4">
        <h2 className="type-h3 text-ink">Your shop</h2>
        <Field label="Shop name" hint="{business} in your texts." error={errors.business_name}><Input value={v.business_name} onChange={(e) => setV({ ...v, business_name: e.target.value })} maxLength={120} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact number" hint="{shop_phone}: in the Contact and Shop texts." error={errors.shop_phone}><Input value={v.shop_phone} onChange={(e) => setV({ ...v, shop_phone: e.target.value })} inputMode="tel" maxLength={40} /></Field>
          <Field label="Delivery days" hint={'{delivery_days}: "delivered within N days".'} error={errors.delivery_days}><Input type="number" min={1} max={30} value={v.delivery_days} onChange={(e) => setV({ ...v, delivery_days: e.target.value })} /></Field>
        </div>
        <Field label="Shop address" hint="{shop_address}: in the Shop text." error={errors.shop_address}><Textarea rows={2} value={v.shop_address} onChange={(e) => setV({ ...v, shop_address: e.target.value })} maxLength={300} /></Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="type-h3 text-ink">How Lingo talks</h2>
        <Field label="Language for new customers" hint="Lingo then follows each customer's own style (Sinhala, Singlish or English if they ask for it).">
          <Select value={v.default_lang} onChange={(e) => setV({ ...v, default_lang: e.target.value as Seller["default_lang"] })} options={[{ value: "si", label: "Sinhala" }, { value: "sg", label: "Singlish" }, { value: "en", label: "English" }]} />
        </Field>
        <Field label="Details to take before the order summary" labelAs="legend" error={errors.order_fields}>
          <div className="flex flex-wrap gap-4">
            {[["name", "Name"], ["address", "Address"], ["contact", "Phone number"]].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 type-body text-ink">
                <Checkbox checked={v.order_fields.includes(k!)} onChange={(e) => field("order_fields", k!, e.target.checked)} />
                {l}
              </label>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Wait before answering (seconds)" hint="Messages sent close together are answered as one. 12 is a good start." error={errors.batch_seconds}><Input type="number" min={2} max={30} value={v.batch_seconds} onChange={(e) => setV({ ...v, batch_seconds: e.target.value })} /></Field>
          <Field label="Pause after handing a chat to you (hours)" error={errors.handoff_pause_hours}><Input type="number" min={1} max={168} value={v.handoff_pause_hours} onChange={(e) => setV({ ...v, handoff_pause_hours: e.target.value })} /></Field>
        </div>
        <Switch checked={v.reply_to_non_ad} onCheckedChange={(x) => setV({ ...v, reply_to_non_ad: x })} label="Also answer people who didn't come from an ad" description="Off = Lingo answers only customers from your Click-to-WhatsApp ads; you handle everyone else." />
        <Field label="Never say" hint="One phrase per line. If an AI answer contains one, Lingo sends &quot;we'll check&quot; instead and hands the chat to you. Health products: Meta's Commerce Policy applies." error={errors.banned_claims}>
          <Textarea rows={4} value={v.banned} onChange={(e) => setV({ ...v, banned: e.target.value })} />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="type-h3 text-ink">Follow-ups</h2>
        <p className="type-small text-ink-muted">One message after a chat goes quiet, only inside WhatsApp&apos;s 24-hour window (so it&apos;s never a paid template).</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="After (hours)" error={errors["followups.hours"]}><Input type="number" min={1} max={20} value={v.fu.hours} onChange={(e) => setV({ ...v, fu: { ...v.fu, hours: e.target.value } })} /></Field>
          <Field label="Send from"><Select value={v.fu.from} onChange={(e) => setV({ ...v, fu: { ...v.fu, from: e.target.value } })} options={HOURS.slice(0, 24)} /></Field>
          <Field label="Until" error={errors["followups.to"]}><Select value={v.fu.to} onChange={(e) => setV({ ...v, fu: { ...v.fu, to: e.target.value } })} options={HOURS.slice(1)} /></Field>
        </div>
        <Switch checked={v.fu.confirmed} onCheckedChange={(x) => setV({ ...v, fu: { ...v.fu, confirmed: x } })} label="After an order: delivery reminder" />
        <Switch checked={v.fu.cancelled} onCheckedChange={(x) => setV({ ...v, fu: { ...v.fu, cancelled: x } })} label="After a cancel: ask why" />
        <Switch checked={v.fu.no_order} onCheckedChange={(x) => setV({ ...v, fu: { ...v.fu, no_order: x } })} label="No order yet: &quot;want to order?&quot; with an Order button" />
      </Card>
      <Button type="submit" disabled={pending} className="self-start">Save settings</Button>
    </form>
  );
}
