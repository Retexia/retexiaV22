"use client";

import { Badge, Button, Card, Field, Input, Select, Textarea } from "@retexia/ui";
import { Building2, CreditCard, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { savePaymentMethod, setDefaultPaymentMethod } from "@/app/(panel)/settings/payment-method-actions";

export type AdminPaymentMethod = { key: string; label: string; description: string | null; status: string; is_default: boolean; instructions: string | null };

const STATUS_OPTIONS = [
  { value: "active", label: "Active: customers can pay this way" },
  { value: "coming_soon", label: "Coming soon: shown, can't be picked" },
  { value: "off", label: "Off: hidden" },
];
const TONE: Record<string, "success" | "warning" | "neutral"> = { active: "success", coming_soon: "warning", off: "neutral" };
const STATUS_LABEL: Record<string, string> = { active: "Active", coming_soon: "Coming soon", off: "Off" };
const ICON: Record<string, typeof CreditCard> = { bank_transfer: Building2, card: CreditCard };

function MethodEditor({ method, canAdmin }: { method: AdminPaymentMethod; canAdmin: boolean }) {
  const router = useRouter();
  const [v, setV] = useState({ label: method.label, description: method.description ?? "", status: method.status, instructions: method.instructions ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"save" | "default" | null>(null);
  const Icon = ICON[method.key] ?? CreditCard;
  const dirty = v.label !== method.label || v.description !== (method.description ?? "") || v.status !== method.status || v.instructions !== (method.instructions ?? "");

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <Icon aria-hidden size={20} strokeWidth={1.5} className="text-ink-muted" />
          <span className="type-h3 text-ink">{method.label}</span>
          <Badge tone={TONE[method.status] ?? "neutral"}>{STATUS_LABEL[method.status] ?? method.status}</Badge>
          {method.is_default ? (
            <Badge tone="brand">
              <Star aria-hidden size={12} strokeWidth={1.5} /> Default
            </Badge>
          ) : null}
        </span>
        {!method.is_default && canAdmin ? (
          <Button
            size="sm"
            variant="secondary"
            loading={busy === "default"}
            disabled={method.status !== "active"}
            title={method.status !== "active" ? "Set it to Active first" : undefined}
            onClick={async () => {
              setBusy("default");
              const r = await setDefaultPaymentMethod({ key: method.key });
              setBusy(null);
              toast[r.ok ? "success" : "error"](r.message ?? "");
              if (r.ok) router.refresh();
            }}
          >
            Make default
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="State" hint={method.is_default ? "The default method must stay Active." : undefined}>
          <Select value={v.status} disabled={!canAdmin} onChange={(e) => setV({ ...v, status: e.target.value || v.status })} options={STATUS_OPTIONS} />
        </Field>
        <Field label="Name customers see" error={errors.label}>
          <Input value={v.label} maxLength={60} disabled={!canAdmin} onChange={(e) => setV({ ...v, label: e.target.value })} />
        </Field>
      </div>
      <Field label="Short description" optionalLabel="Optional">
        <Input value={v.description} maxLength={300} disabled={!canAdmin} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      {method.key === "bank_transfer" ? (
        <Field
          label="Bank details"
          hint="Shown to the customer with the amount and their reference. Markdown works (line breaks, **bold**)."
          error={errors.instructions}
          required
        >
          <Textarea rows={6} value={v.instructions} maxLength={4000} disabled={!canAdmin} onChange={(e) => setV({ ...v, instructions: e.target.value })} />
        </Field>
      ) : (
        <p className="type-small text-ink-muted">Card payments run through PayHere (status below). Set this to Active once PayHere has approved your account.</p>
      )}
      {canAdmin ? (
        <Button
          className="self-start"
          size="sm"
          loading={busy === "save"}
          disabled={!dirty}
          onClick={async () => {
            setBusy("save");
            const r = await savePaymentMethod({ key: method.key, ...v });
            setBusy(null);
            setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
            toast[r.ok ? "success" : "error"](r.message ?? "");
            if (r.ok) router.refresh();
          }}
        >
          Save {method.label.toLowerCase()}
        </Button>
      ) : null}
    </div>
  );
}

/** Settings → Payments: how customers can pay, each method's state, and the default. */
export function PaymentMethodsCard({ methods, canAdmin }: { methods: AdminPaymentMethod[]; canAdmin: boolean }) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="type-h2 text-ink">Payment methods</h2>
        <p className="type-body text-ink-muted">
          How customers pay for a request. They pick a method on their request page (the default is chosen for them first) and can switch while it waits for payment.
          Bank transfers wait for you to confirm the slip under Payments; confirming it starts the service.
        </p>
      </div>
      {methods.map((m) => (
        <MethodEditor key={`${m.key}-${m.status}-${m.is_default}`} method={m} canAdmin={canAdmin} />
      ))}
    </Card>
  );
}
