"use client";

import { Button, Card } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { Link2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cancelPayhere, checkPayherePayment } from "@/app/(panel)/settings/payhere-actions";

/** Waiting for payment: copy the customer's pay link, or look the payment up in PayHere. */
export function PayhereAwaiting({ orderId, payUrl }: { orderId: string; payUrl: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="type-h3 text-ink">Waiting for payment</h2>
        <p className="type-small text-ink-muted">The customer pays with Pay now on their request (PayHere). Send them the link, or check PayHere if they say they paid.</p>
      </div>
      <span className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<Link2 aria-hidden size={14} strokeWidth={1.5} />}
          onClick={async () => {
            await navigator.clipboard?.writeText(payUrl).catch(() => undefined);
            toast.success("Pay link copied (the customer signs in, then pays)");
          }}
        >
          Copy pay link
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={checking}
          icon={<Search aria-hidden size={14} strokeWidth={1.5} />}
          onClick={async () => {
            setChecking(true);
            const r = await checkPayherePayment({ orderId });
            setChecking(false);
            if (r.ok) toast.success(r.message ?? "Recorded");
            else toast.error(r.message);
            router.refresh();
          }}
        >
          Check payment in PayHere
        </Button>
      </span>
    </Card>
  );
}

/** The request's PayHere subscription, with cancel. */
export function PayhereSubscription({ orderId, subscriptionId, canAdmin, final }: { orderId: string; subscriptionId: string; canAdmin: boolean; final: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="type-h3 text-ink">PayHere subscription</h2>
        <p className="font-mono type-small text-ink-muted">{subscriptionId}</p>
      </div>
      {canAdmin && !final ? (
        <Button size="sm" variant="secondary" onClick={() => setConfirm(true)}>
          Cancel subscription
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Cancel this subscription?"
        description="PayHere stops charging the customer and the request is cancelled. Refunds are separate (PayHere → Payments)."
        confirmLabel="Cancel subscription"
        danger
        onConfirm={async () => {
          const r = await cancelPayhere({ orderId });
          setConfirm(false);
          if (r.ok) toast.success(r.message ?? "Cancelled");
          else toast.error(r.message);
          router.refresh();
        }}
      />
    </Card>
  );
}
