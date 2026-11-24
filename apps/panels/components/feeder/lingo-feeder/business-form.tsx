"use client";

import { Button, Card, Field, Input, Switch, Textarea } from "@retexia/ui";
import { useState } from "react";
import { saveBusiness } from "@/app/feeder/(app)/lingo-feeder/actions";
import type { Seller } from "@/lib/feeder/lingo-feeder/data";
import { Bubble, useAction } from "./common";

export function BusinessForm({ seller }: { seller: Seller }) {
  const [v, setV] = useState({
    business_name: seller.business_name === "My shop" ? "" : seller.business_name,
    phone: seller.phone ?? "",
    location: seller.location ?? "",
    address: seller.address ?? "",
    delivery_days: seller.delivery_days,
    call_hours: seller.call_hours,
    about: seller.about ?? "",
    ads_only: seller.ads_only,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, go } = useAction();
  const shop = v.business_name || "your shop";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await go(() => saveBusiness(v));
          setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
        }}
      >
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="type-h3 text-ink">Your business</h2>
            <p className="type-small text-ink-muted">Products are the same for every Feeder seller; these details are yours. Lingo uses them when she greets customers and answers &quot;where are you?&quot; or &quot;when will it come?&quot;.</p>
          </div>
          <Field label="Shop name" required hint={'"Good evening Nimal 😊 I\'m Lingo from …"'} error={errors.business_name}>
            <Input value={v.business_name} onChange={(e) => setV({ ...v, business_name: e.target.value })} maxLength={80} placeholder="e.g. Ayora Lanka" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Town / area" hint="Where you're based" error={errors.location}>
              <Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} maxLength={120} placeholder="e.g. Matara" />
            </Field>
            <Field label="Contact number" hint="Lingo gives it if a customer asks for your number" error={errors.phone}>
              <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} inputMode="tel" maxLength={40} />
            </Field>
          </div>
          <Field label="Address" error={errors.address}>
            <Textarea rows={2} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} maxLength={300} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Delivery time (days)" required hint={'"2-3" or "3"'} error={errors.delivery_days}>
              <Input value={v.delivery_days} onChange={(e) => setV({ ...v, delivery_days: e.target.value })} maxLength={5} />
            </Field>
            <Field label="When you call customers back" required hint="Lingo promises a call in these hours" error={errors.call_hours}>
              <Input value={v.call_hours} onChange={(e) => setV({ ...v, call_hours: e.target.value })} maxLength={40} placeholder="9am - 6pm" />
            </Field>
          </div>
          <Field label="A line about your shop" hint="Lingo may use it if someone asks who you are. Only true facts." error={errors.about}>
            <Textarea rows={2} value={v.about} onChange={(e) => setV({ ...v, about: e.target.value })} maxLength={300} placeholder="e.g. We've sold Ayurvedic products online since 2021." />
          </Field>
          <Switch checked={v.ads_only} onCheckedChange={(x) => setV({ ...v, ads_only: x })} label="Answer only customers from my ads" description="Off = Lingo also answers people who message you without an ad." />
          <Button type="submit" disabled={pending} className="self-start">Save</Button>
        </Card>
      </form>
      <aside className="flex flex-col gap-3">
        <p className="type-label text-ink-muted">How it reads on WhatsApp</p>
        <Card padded={false} className="flex flex-col gap-3 bg-surface-sunk p-4">
          <Bubble side="in" tone="customer" text="Hello! Can I get more info on this?" />
          <Bubble
            text={`සුභ සන්ධ්‍යාවක් Nimal 😊 මම Lingo, ${shop} එකෙන්.\n💵 Delivery එක්කම මුළු මුදල රු. 1,790/- යි. බඩුව ගෙදරට ආවම ගෙවන්න පුළුවන් (Cash on delivery).\n\nඕඩර් එක දාන්න මේ විස්තර ටික එවන්න 👇\n👤 නම :\n🏠 ලිපිනය :\n📞 දුරකථන අංකය :`}
            buttons={[{ title: "🛒 ඕඩර් කරන්න" }, { title: "📖 භාවිතා කරන හැටි" }, { title: "📞 මට Call කරන්න" }]}
          />
          <Bubble side="in" tone="customer" text="Dawas kiyak yanawada?" />
          <Bubble text={`🚚 Lankawe onama thanakata delivery karanawa, charge eka Rs. 450/- yi. Order eka dala dawas ${v.delivery_days || "2-3"} athara courier eken gedaratama genath denawa, enna kalin call ekak dei 📞`} />
        </Card>
      </aside>
    </div>
  );
}
