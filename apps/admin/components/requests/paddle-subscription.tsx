"use client";

import { Button, Card } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cancelPaddleSubscription } from "@/app/(panel)/settings/paddle-actions";

/** The request's Paddle subscription: open it in Paddle, or cancel it. */
export function PaddleSubscription({ orderId, subscriptionId, customerId, dashboardUrl, canAdmin, final }: { orderId: string; subscriptionId: string; customerId: string | null; dashboardUrl: string; canAdmin: boolean; final: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"next_billing_period" | "immediately" | null>(null);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="type-h3 text-ink">Paddle subscription</h2>
        <p className="font-mono type-small text-ink-muted">
          {subscriptionId}
          {customerId ? ` · ${customerId}` : ""}
        </p>
      </div>
      <span className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" href={dashboardUrl} target="_blank" iconAfter={<ExternalLink aria-hidden size={14} strokeWidth={1.5} />}>
          Open in Paddle
        </Button>
        {canAdmin && !final ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setConfirm("next_billing_period")}>
              Cancel at period end
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm("immediately")}>
              Cancel now
            </Button>
          </>
        ) : null}
      </span>
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "immediately" ? "Cancel the subscription now?" : "Cancel at the end of the paid period?"}
        description={
          confirm === "immediately"
            ? "Paddle stops billing at once and the request is cancelled. Refunds are separate (do them in Paddle)."
            : "The customer keeps the service until the period they paid for ends; then the request is cancelled."
        }
        confirmLabel="Cancel subscription"
        danger
        onConfirm={async () => {
          if (!confirm) return;
          const r = await cancelPaddleSubscription({ orderId, when: confirm });
          setConfirm(null);
          if (r.ok) toast.success(r.message ?? "Done");
          else toast.error(r.message);
          router.refresh();
        }}
      />
    </Card>
  );
}
