"use client";

import { Button, Card, Input } from "@retexia/ui";
import { Link2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { checkPaddlePayment, createPaymentLink } from "@/app/(panel)/settings/paddle-actions";

/** Awaiting payment: copy a Paddle checkout link to send the customer (WhatsApp, email). */
export function PaddlePaymentLink({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [txn, setTxn] = useState("");
  const [checking, setChecking] = useState(false);
  const router = useRouter();
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
      <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="type-small text-ink-muted">Customer says they paid?</span>
        <Input value={txn} onChange={(e) => setTxn(e.target.value.trim())} placeholder="txn_… (optional)" className="max-w-56" aria-label="Paddle transaction id" />
        <Button
          size="sm"
          variant="secondary"
          loading={checking}
          icon={<Search aria-hidden size={14} strokeWidth={1.5} />}
          onClick={async () => {
            setChecking(true);
            const r = await checkPaddlePayment({ orderId, transactionId: txn || undefined });
            setChecking(false);
            if (r.ok) toast.success(r.message ?? "Recorded");
            else toast.error(r.message);
            router.refresh();
          }}
        >
          Check payment in Paddle
        </Button>
      </div>
    </Card>
  );
}
