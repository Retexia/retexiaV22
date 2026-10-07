"use client";

import { Button, Card, Field, Input, Select } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveBotSettings } from "@/app/lingo/actions";
import type { Lang } from "@/lib/lingo/db.types";
import { LANGS } from "@/lib/lingo/labels";

type V = { business_name: string; staff_name: string; owner_phone: string; default_language: Lang; content_language: Lang; followup_hours: string; delivery_days: string };

export function BotSettingsForm({ initial, whatsapp }: { initial: V; whatsapp: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">How Lingo introduces itself</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" error={errors.business_name} required>
            <Input value={v.business_name} onChange={(e) => setV({ ...v, business_name: e.target.value })} />
          </Field>
          <Field label="Staff name Lingo uses" hint="e.g. “Nimali”. Empty = just the business." error={errors.staff_name} optionalLabel="Optional">
            <Input value={v.staff_name} onChange={(e) => setV({ ...v, staff_name: e.target.value })} />
          </Field>
          <Field label="Replies in" hint="Customers can ask to switch language.">
            <Select value={v.default_language} onChange={(e) => setV({ ...v, default_language: (e.target.value || "si") as Lang })} options={LANGS} />
          </Field>
          <Field label="Your product texts are written in" hint="So Lingo knows when to translate them.">
            <Select value={v.content_language} onChange={(e) => setV({ ...v, content_language: (e.target.value || "si") as Lang })} options={LANGS} />
          </Field>
        </div>
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">Orders and follow-ups</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your phone for new-order alerts" hint="New orders are sent here on WhatsApp. Digits with country code: 94771234567." error={errors.owner_phone} optionalLabel="Optional">
            <Input inputMode="tel" value={v.owner_phone} onChange={(e) => setV({ ...v, owner_phone: e.target.value })} />
          </Field>
          <Field label="Follow up after (hours)" hint="If a customer goes quiet, Lingo checks in once after this long." error={errors.followup_hours}>
            <Input type="number" min={1} max={72} value={v.followup_hours} onChange={(e) => setV({ ...v, followup_hours: e.target.value })} />
          </Field>
          <Field label="Delivery takes (days)" hint="Used in follow-up messages after an order." error={errors.delivery_days}>
            <Input type="number" min={1} max={30} value={v.delivery_days} onChange={(e) => setV({ ...v, delivery_days: e.target.value })} />
          </Field>
          <Field label="WhatsApp connection" hint="Managed by Retexia. Message us to change the number.">
            <Input value={whatsapp} disabled />
          </Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button
          size="lg"
          loading={busy}
          disabled={JSON.stringify(v) === JSON.stringify(initial)}
          onClick={async () => {
            setBusy(true);
            const r = await saveBotSettings({ ...v, followup_hours: Number(v.followup_hours) || 5, delivery_days: Number(v.delivery_days) || 3 });
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
          Save settings
        </Button>
      </div>
    </div>
  );
}
