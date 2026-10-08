"use client";

import { Button } from "@retexia/ui";
import { Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { openBillingPortal } from "@/app/(site)/account/billing-actions";

/** Opens Paddle's billing portal (card, invoices, cancel) for this request. */
export function BillingButton({ refId, label }: { refId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={busy}
      icon={<Receipt aria-hidden size={16} strokeWidth={1.5} />}
      onClick={async () => {
        setBusy(true);
        const r = await openBillingPortal({ ref: refId });
        setBusy(false);
        if (!r.ok) {
          toast.error(r.message);
          return;
        }
        window.location.href = r.data.url;
      }}
    >
      {label}
    </Button>
  );
}
