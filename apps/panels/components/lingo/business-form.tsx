"use client";

import { Button, Card, Field, Input, Textarea } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveBusinessDetails } from "@/app/lingo/actions";

type V = {
  business_type: string;
  about: string;
  address: string;
  location_url: string;
  opening_hours: string;
  contact_phone: string;
  website: string;
  delivery_areas: string;
  delivery_time: string;
  default_delivery_fee: string;
  payment_methods: string;
  extra_info: string;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="type-h2 text-ink">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export function BusinessForm({ initial }: { initial: V }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const f = (k: keyof V, label: string, o: { rows?: number; hint?: string; wide?: boolean; placeholder?: string } = {}) => (
    <Field label={label} hint={o.hint} error={errors[k]} optionalLabel="Optional" className={o.wide ? "sm:col-span-2" : undefined}>
      {o.rows ? <Textarea rows={o.rows} value={v[k]} placeholder={o.placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} /> : <Input value={v[k]} placeholder={o.placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
    </Field>
  );
  return (
    <div className="flex flex-col gap-6">
      <Section title="About the shop">
        {f("business_type", "Type of business", { placeholder: "Herbal products" })}
        {f("contact_phone", "Contact phone")}
        {f("about", "About", { rows: 4, wide: true, hint: "A few sentences: what you sell and what makes you different." })}
        {f("website", "Website")}
        {f("opening_hours", "Opening hours", { placeholder: "Mon–Sat 9 am–6 pm" })}
      </Section>
      <Section title="Location">
        {f("address", "Address", { rows: 2, wide: true })}
        {f("location_url", "Google Maps link", { wide: true, placeholder: "https://maps.app.goo.gl/…" })}
      </Section>
      <Section title="Delivery and payment">
        <Field label="Usual delivery charge (Rs.)" error={errors.default_delivery_fee}>
          <Input inputMode="decimal" value={v.default_delivery_fee} onChange={(e) => setV({ ...v, default_delivery_fee: e.target.value })} />
        </Field>
        {f("delivery_time", "Delivery time", { placeholder: "2–3 working days" })}
        {f("delivery_areas", "Where you deliver", { rows: 2, wide: true, placeholder: "Island-wide" })}
        {f("payment_methods", "Payment methods", { rows: 2, wide: true, placeholder: "Cash on delivery, bank transfer" })}
      </Section>
      <Section title="Anything else Lingo should know">
        {f("extra_info", "Other information", { rows: 4, wide: true, hint: "Return policy, warranty, special notes…" })}
      </Section>
      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button
          size="lg"
          loading={busy}
          disabled={!dirty}
          onClick={async () => {
            setBusy(true);
            const r = await saveBusinessDetails({ ...v, default_delivery_fee: Number(v.default_delivery_fee.replace(/,/g, "")) || 0 });
            setBusy(false);
            if (!r.ok) {
              setErrors(r.fieldErrors ?? {});
              return toast.error(r.message);
            }
            setErrors({});
            toast.success(r.message ?? "Saved");
            router.refresh();
          }}
        >
          Save details
        </Button>
      </div>
    </div>
  );
}
