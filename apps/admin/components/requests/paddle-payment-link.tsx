"use client";

import { Button, Card } from "@retexia/ui";
import { Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createPaymentLink } from "@/app/(panel)/settings/paddle-actions";

/** Awaiting payment: copy a Paddle checkout link to send the customer (WhatsApp, email). */
export function PaddlePaymentLink({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="type-h3 text-ink">Waiting for payment</h2>
        <p className="type-small text-ink-muted">The customer can press Pay now on their request. Or send them a Paddle link:</p>
        {url ? <code className="truncate type-small text-ink select-all">{url}</code> : null}
      </div>
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        icon={<Link2 aria-hidden size={14} strokeWidth={1.5} />}
        onClick={async () => {
          setBusy(true);
          const r = await createPaymentLink({ orderId });
          setBusy(false);
          if (!r.ok || !r.data) {
            toast.error(r.message ?? "Couldn't create the link");
            return;
          }
          setUrl(r.data);
          await navigator.clipboard?.writeText(r.data).catch(() => undefined);
          toast.success("Payment link copied");
        }}
      >
        Copy payment link
      </Button>
    </Card>
  );
}
