"use client";

import { Button, Card, Field, Input, Switch, Textarea } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveBusinessDetails } from "@/app/feeder/(app)/business/actions";

type Details = { business_name: string; phone: string; location: string; address: string; delivery_days: string; call_hours: string; about: string };

/** The shared business details form (Lingo Feeder, Auto comment and the rest read them). adsOnly = null when Lingo Feeder isn't on the account. */
export function BusinessDetails({ initial, adsOnly }: { initial: Details; adsOnly: boolean | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [ads, setAds] = useState(adsOnly ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: keyof Details, x: string) => setV((o) => ({ ...o, [k]: x }));

  return (
    <form
      className="flex max-w-3xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBusinessDetails({ ...v, ...(adsOnly === null ? {} : { ads_only: ads }) });
          if (r.ok) {
            setErrors({});
            toast.success(r.message ?? "Saved.");
            router.refresh();
          } else {
            setErrors(r.fieldErrors ?? {});
            toast.error(r.message);
          }
        });
      }}
    >
      <Card className="flex flex-col gap-4">
        <Field label="Shop name" required hint={'Lingo greets with it: "I\'m Lingo from …"'} error={errors.business_name}>
          <Input value={v.business_name} onChange={(e) => set("business_name", e.target.value)} maxLength={80} placeholder="e.g. Ayora Lanka" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Town / area" hint="Where you're based" error={errors.location}>
            <Input value={v.location} onChange={(e) => set("location", e.target.value)} maxLength={120} placeholder="e.g. Matara" />
          </Field>
          <Field label="Contact number" hint="Given when a customer asks for your number" error={errors.phone}>
            <Input value={v.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" maxLength={40} />
          </Field>
        </div>
        <Field label="Address" error={errors.address}>
          <Textarea rows={2} value={v.address} onChange={(e) => set("address", e.target.value)} maxLength={300} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery time (days)" required hint={'"2-3" or "3"'} error={errors.delivery_days}>
            <Input value={v.delivery_days} onChange={(e) => set("delivery_days", e.target.value)} maxLength={5} />
          </Field>
          <Field label="When you call customers back" required hint="Promised to customers who ask for a call" error={errors.call_hours}>
            <Input value={v.call_hours} onChange={(e) => set("call_hours", e.target.value)} maxLength={40} placeholder="9am - 6pm" />
          </Field>
        </div>
        <Field label="A line about your shop" hint="Used if someone asks who you are. Only true facts." error={errors.about}>
          <Textarea rows={2} value={v.about} onChange={(e) => set("about", e.target.value)} maxLength={300} placeholder="e.g. We've sold Ayurvedic products online since 2021." />
        </Field>
      </Card>
      {adsOnly !== null ? (
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">Lingo Feeder</h2>
          <Switch checked={ads} onCheckedChange={setAds} label="Answer only customers from my ads" description="Off = Lingo also answers people who message you without an ad." />
        </Card>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        Save
      </Button>
    </form>
  );
}
