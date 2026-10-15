"use client";

import { Badge, cn } from "@retexia/ui";
import { Building2, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { choosePaymentMethod } from "@/app/(site)/account/actions";

export type PickerMethod = { key: string; label: string; description: string | null; status: string };

const ICONS: Record<string, typeof CreditCard> = { bank_transfer: Building2, card: CreditCard };

/** Bank transfer or card: active methods can be picked; "coming soon" ones are shown but not selectable. */
export function PaymentMethodPicker({ orderId, methods, current, soonLabel, legend }: { orderId: string; methods: PickerMethod[]; current: string; soonLabel: string; legend: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState<string | null>(null);

  async function pick(key: string) {
    if (key === value || busy) return;
    const previous = value;
    setValue(key);
    setBusy(key);
    const r = await choosePaymentMethod({ orderId, method: key });
    setBusy(null);
    if (!r.ok) {
      setValue(previous);
      toast.error(r.message);
      return;
    }
    router.refresh();
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 type-label text-ink">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {methods.map((m) => {
          const Icon = ICONS[m.key] ?? CreditCard;
          const soon = m.status !== "active";
          const selected = value === m.key;
          return (
            <label
              key={m.key}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-hover focus-within:focus-ring",
                selected ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
                soon && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={`pay-method-${orderId}`}
                value={m.key}
                checked={selected}
                disabled={soon || Boolean(busy)}
                onChange={() => pick(m.key)}
                className="sr-only"
              />
              <Icon aria-hidden size={20} strokeWidth={1.5} className={selected ? "text-brand" : "text-ink-muted"} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 type-label text-ink">
                  {m.label}
                  {soon ? <Badge tone="neutral">{soonLabel}</Badge> : null}
                </span>
                {m.description ? <span className="type-small text-ink-muted">{m.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
