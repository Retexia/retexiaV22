"use client";

import { makeT, type FormDef, type FormValues } from "@retexia/forms";
import { FormPreview } from "@retexia/forms/react";
import { Alert, Button, Dialog, Field, Input, Select } from "@retexia/ui";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { editAnswers, updateOrder } from "@/app/(panel)/requests/actions";

/** Admin: edit the customer's answers with the real form (validated, audited). */
export function EditAnswersButton({ orderId, orderRef, form, initial }: { orderId: string; orderRef: string; form: FormDef; initial: FormValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button variant="ghost" size="sm" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setOpen(true)}>
        Edit answers
      </Button>
      <Dialog open={open} onOpenChange={setOpen} size="lg" title="Edit answers" description="Changes are saved to the request and recorded in the audit log.">
        <div className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <FormPreview
            form={form}
            t={makeT({})}
            initial={initial}
            completeLabel="Save answers"
            onComplete={async (values) => {
              const r = await editAnswers({ orderId, ref: orderRef, values });
              if (r.ok) {
                toast.success(r.message ?? "Saved");
                setOpen(false);
                router.refresh();
              } else setError(r.message);
            }}
          />
        </div>
      </Dialog>
    </>
  );
}

/** Admin: change package, billing or price (reason required, audited). */
export function ChangePricingButton({
  orderId,
  orderRef,
  current,
  packages,
  currency,
}: {
  orderId: string;
  orderRef: string;
  current: { packageId: string; billing: string; price: number; setupFee: number };
  packages: { id: string; name: string; price_monthly: number; price_yearly: number | null; setup_fee: number }[];
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [packageId, setPackageId] = useState(current.packageId);
  const [billing, setBilling] = useState(current.billing);
  const [price, setPrice] = useState(String(current.price));
  const [setupFee, setSetupFee] = useState(String(current.setupFee));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pkg = packages.find((p) => p.id === packageId);
  const listPrice = pkg ? (billing === "yearly" ? pkg.price_yearly : pkg.price_monthly) : null;

  return (
    <>
      <Button variant="ghost" size="sm" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setOpen(true)}>
        Change
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Change package or price"
        description="The customer's price is a snapshot. Changing it here does not change the package price on the website."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={!reason.trim()}
              onClick={async () => {
                setError(null);
                const changes: Record<string, unknown> = {};
                if (packageId !== current.packageId) changes.package_id = packageId;
                if (billing !== current.billing) changes.billing_cycle = billing;
                if (Number(price) !== current.price) changes.price_amount = Number(price);
                if (Number(setupFee) !== current.setupFee) changes.setup_fee = Number(setupFee);
                if (!Object.keys(changes).length) {
                  setOpen(false);
                  return;
                }
                setPending(true);
                const r = await updateOrder({ orderId, ref: orderRef, changes, reason });
                setPending(false);
                if (r.ok) {
                  toast.success(r.message ?? "Saved");
                  setOpen(false);
                  router.refresh();
                } else setError(r.message);
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Package" required>
              <Select
                value={packageId}
                onChange={(e) => {
                  setPackageId(e.target.value);
                  const p = packages.find((x) => x.id === e.target.value);
                  if (p) {
                    setPrice(String(billing === "yearly" ? (p.price_yearly ?? p.price_monthly) : p.price_monthly));
                    setSetupFee(String(p.setup_fee));
                  }
                }}
                options={packages.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            <Field label="Billing" required>
              <Select
                value={billing}
                onChange={(e) => {
                  setBilling(e.target.value);
                  if (pkg) setPrice(String(e.target.value === "yearly" ? (pkg.price_yearly ?? pkg.price_monthly) : pkg.price_monthly));
                }}
                options={[
                  { value: "monthly", label: "Monthly" },
                  { value: "yearly", label: "Yearly" },
                ]}
              />
            </Field>
            <Field label={`Price (${currency})`} hint={listPrice !== null ? `List price: ${listPrice}` : undefined} required>
              <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label={`Setup fee (${currency})`} required>
              <Input type="number" min={0} step="0.01" value={setupFee} onChange={(e) => setSetupFee(e.target.value)} />
            </Field>
          </div>
          <Field label="Reason" hint="Saved on the request as an internal note." required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Founding customer discount" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
