"use client";

import { Button, Card, Checkbox, Field, Select, Textarea } from "@retexia/ui";
import { LifeBuoy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { startSupportSession } from "@/app/(panel)/customers/actions";

export type SupportPanel = { slug: string; name: string };

/**
 * "Open as customer": opens one of the customer's product panels (Post, Lingo,
 * Feeder, Plan…) as them in a new tab, to change their settings for them.
 * Admins and owners; needs a reason; logged; the customer can be told.
 */
export function SupportAccess({ customerId, customerName, panels }: { customerId: string; customerName: string; panels: SupportPanel[] }) {
  const [product, setProduct] = useState(panels[0]?.slug ?? "");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (reason.trim().length < 3) return setError("Say why you're opening their account");
    setError(null);
    // Open the tab now (in the click) so the browser doesn't block it, then send it to the link.
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    const r = await startSupportSession({ customer_id: customerId, product, reason, notify });
    setBusy(false);
    if (!r.ok || !r.data) {
      tab?.close();
      return toast.error(r.message);
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = r.data;
    } else {
      window.location.href = r.data;
    }
    toast.success(`Opened ${customerName}'s panel in a new tab`);
    setReason("");
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <LifeBuoy aria-hidden size={18} strokeWidth={1.5} className="text-brand" />
        <h2 className="type-h2 text-ink">Open as customer</h2>
      </div>
      <p className="type-small text-ink-muted">
        Work in {customerName}&apos;s panel as them, e.g. to change their settings. You stay signed in as yourself; a banner shows support mode, it ends after an hour or
        when you press End, and it&apos;s recorded under Activity.
      </p>
      {panels.length ? (
        <>
          <Field label="Panel">
            <Select value={product} onChange={(e) => setProduct(e.target.value)} options={panels.map((p) => ({ value: p.slug, label: p.name }))} />
          </Field>
          <Field label="Why" required error={error ?? undefined} hint="Saved in the log (and in the email, if you send one).">
            <Textarea rows={2} value={reason} maxLength={300} placeholder="e.g. Asked us to switch his posts to English" onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Checkbox label="Email the customer that we're helping" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <Button loading={busy} onClick={open} disabled={!product} className="self-start" icon={<LifeBuoy aria-hidden size={16} strokeWidth={1.5} />}>
            Open as customer
          </Button>
        </>
      ) : (
        <p className="type-small text-ink-muted">This customer has no product with a live panel yet.</p>
      )}
    </Card>
  );
}
