"use client";

import { Card, Field, Input, Textarea, formatPrice } from "@retexia/ui";
import { Receipt } from "@retexia/ui/admin";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { savePaymentSettings } from "@/app/(panel)/settings/actions";
import { MediaInput } from "@/components/website/media-picker";
import { SaveBar } from "./save-bar";

export type PaymentSettings = {
  invoice_business_name: string;
  invoice_address: string;
  invoice_footer: string;
  invoice_logo_url: string;
  receipt_prefix: string;
};

export function PaymentsForm({ initial, currency, siteName, logoUrl, email, phone }: { initial: PaymentSettings; currency: string; siteName: string; logoUrl: string | null; email: string | null; phone: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const year = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <h2 className="type-h2 text-ink">Receipts</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name on receipts" optionalLabel="Optional" hint={`Empty = ${siteName}`}>
              <Input value={v.invoice_business_name} onChange={(e) => setV({ ...v, invoice_business_name: e.target.value })} />
            </Field>
            <Field label="Receipt number prefix" hint={`Numbers look like ${v.receipt_prefix || "RCT"}-${year}-0001. Restarts each year.`} error={errors.receipt_prefix} required>
              <Input value={v.receipt_prefix} maxLength={8} onChange={(e) => setV({ ...v, receipt_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
            </Field>
            <Field label="Address" optionalLabel="Optional" className="sm:col-span-2">
              <Textarea rows={2} value={v.invoice_address} onChange={(e) => setV({ ...v, invoice_address: e.target.value })} />
            </Field>
            <Field label="Small print" hint="E.g. registration number, thank-you line." optionalLabel="Optional" className="sm:col-span-2">
              <Textarea rows={2} value={v.invoice_footer} onChange={(e) => setV({ ...v, invoice_footer: e.target.value })} />
            </Field>
            <Field label="Logo on receipts" hint="Empty = the site logo." optionalLabel="Optional" className="sm:col-span-2">
              <MediaInput value={v.invoice_logo_url} onChange={(invoice_logo_url) => setV({ ...v, invoice_logo_url })} />
            </Field>
          </div>
        </Card>
        <div className="overflow-x-auto rounded-lg border border-line bg-white p-4" aria-label="Receipt preview">
          <div className="origin-top-left scale-[0.8] sm:scale-100">
            <Receipt
              data={{
                business: { name: v.invoice_business_name || siteName, address: v.invoice_address || null, logoUrl: v.invoice_logo_url || logoUrl, footer: v.invoice_footer || null, email, phone },
                number: `${v.receipt_prefix || "RCT"}-${year}-0001`,
                date: new Date().toLocaleDateString("en-LK", { day: "numeric", month: "long", year: "numeric" }),
                status: "confirmed",
                customer: { name: "Sample Customer", email: "customer@example.com", phone: "+94 77 123 4567", business: "Sample Bakery" },
                order: { ref: `LIN-${year}-0001`, product: "Retexia Lingo", package: "Pro", billing: "Monthly" },
                items: [
                  { label: "Setup fee", amount: formatPrice(15000, currency) },
                  { label: "Pro plan", detail: "1 month", amount: formatPrice(14900, currency) },
                ],
                total: formatPrice(29900, currency),
                method: "Bank transfer",
                reference: `LIN-${year}-0001`,
              }}
            />
          </div>
        </div>
      </div>

      <SaveBar
        dirty={dirty}
        busy={busy}
        onDiscard={() => setV(initial)}
        onSave={async () => {
          setBusy(true);
          const r = await savePaymentSettings(v);
          setBusy(false);
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            return toast.error(r.message);
          }
          setErrors({});
          toast.success(r.message ?? "Saved");
          router.refresh();
        }}
      />
    </div>
  );
}
