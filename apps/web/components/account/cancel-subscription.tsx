"use client";

import { Button, Dialog } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cancelSubscription } from "@/app/(site)/account/payhere-actions";

/** Stops a PayHere subscription (no more renewals) and closes the request. */
export function CancelSubscriptionButton({ refId, labels }: { refId: string; labels: { button: string; title: string; body: string; confirm: string; keep: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {labels.button}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={labels.title}
        description={labels.body}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {labels.keep}
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const r = await cancelSubscription({ ref: refId });
                setBusy(false);
                setOpen(false);
                if (r.ok) toast.success(r.message);
                else toast.error(r.message);
                router.refresh();
              }}
            >
              {labels.confirm}
            </Button>
          </>
        }
      />
    </>
  );
}
