"use client";

import { initialValues, type FormDef } from "@retexia/forms";
import { FormPreview } from "@retexia/forms/react";
import { Alert, Card, Field, Select, formatPrice } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createRequest } from "@/app/(panel)/requests/actions";
import type { CustomerOption } from "@/app/(panel)/customers/actions";
import { CustomerPicker } from "@/components/common/customer-picker";

type Product = { id: string; name: string; status: string };
type Package = { id: string; product_id: string; name: string; price_monthly: number; price_yearly: number | null; setup_fee: number; currency: string | null; is_active: boolean };

export function NewRequest({
  products,
  packages,
  forms,
  canInvite,
  currency,
  initialCustomer = null,
  initialProductId,
}: {
  products: Product[];
  packages: Package[];
  forms: Record<string, FormDef>;
  canInvite: boolean;
  currency: string;
  initialCustomer?: CustomerOption | null;
  initialProductId?: string;
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerOption | null>(initialCustomer);
  const [productId, setProductId] = useState(initialProductId ?? products[0]?.id ?? "");
  const productPackages = packages.filter((p) => p.product_id === productId && p.is_active);
  const [packageId, setPackageId] = useState(productPackages[0]?.id ?? "");
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [source, setSource] = useState<"whatsapp" | "referral" | "admin">("whatsapp");
  const [error, setError] = useState<string | null>(null);
  const pkg = packages.find((p) => p.id === packageId);
  const form = forms[productId];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card className="flex flex-col gap-5 self-start">
        <Field label="Customer" labelAs="legend" required>
          <CustomerPicker value={customer} onChange={setCustomer} canInvite={canInvite} />
        </Field>
        <Field label="Product" required>
          <Select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setPackageId(packages.find((p) => p.product_id === e.target.value && p.is_active)?.id ?? "");
            }}
            options={products.map((p) => ({ value: p.id, label: `${p.name}${p.status !== "live" ? ` (${p.status.replace("_", " ")})` : ""}` }))}
          />
        </Field>
        <Field label="Package" required>
          <Select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            options={productPackages.map((p) => ({ value: p.id, label: `${p.name} · ${formatPrice(p.price_monthly, p.currency ?? currency)} / month` }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Billing" required>
            <Select
              value={billing}
              onChange={(e) => setBilling(e.target.value as "monthly")}
              options={[
                { value: "monthly", label: "Monthly" },
                ...(pkg?.price_yearly !== null && pkg?.price_yearly !== undefined ? [{ value: "yearly", label: "Yearly" }] : []),
              ]}
            />
          </Field>
          <Field label="Source" required>
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as "whatsapp")}
              options={[
                { value: "whatsapp", label: "WhatsApp" },
                { value: "referral", label: "Referral" },
                { value: "admin", label: "Admin (other)" },
              ]}
            />
          </Field>
        </div>
        {pkg ? (
          <p className="type-small text-ink-muted">
            Price is taken from the package: {formatPrice(billing === "yearly" ? (pkg.price_yearly ?? 0) : pkg.price_monthly, pkg.currency ?? currency)} {billing === "yearly" ? "/ year" : "/ month"} +{" "}
            {formatPrice(pkg.setup_fee, pkg.currency ?? currency)} setup. Change it on the request afterwards if needed.
          </p>
        ) : null}
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">The customer&apos;s answers</h2>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {!customer || !packageId ? <Alert tone="info">Choose the customer and package first.</Alert> : null}
        {form ? (
          <FormPreview
            key={productId}
            form={form}
            initial={initialValues(form, { full_name: customer?.name, phone: customer?.phone, email: customer?.email })}
            completeLabel="Create request"
            onComplete={async (values) => {
              if (!customer || !packageId) {
                setError("Choose the customer and package first.");
                return;
              }
              setError(null);
              const r = await createRequest({ userId: customer.id, productId, packageId, billingCycle: billing, source, values });
              if (r.ok && r.data) {
                toast.success(`Request ${r.data} created`);
                router.push(`/requests/${encodeURIComponent(r.data)}`);
              } else setError(r.ok ? "Could not create." : r.message);
            }}
          />
        ) : (
          <Alert tone="warning">This product has no onboarding form. Add one under Products → Onboarding form.</Alert>
        )}
      </Card>
    </div>
  );
}
