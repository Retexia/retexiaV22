"use client";

import { Button, Dialog, Field, Textarea } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cancelOrder } from "@/app/(site)/account/actions";
import { useT } from "@/lib/strings-context";

export function CancelOrderButton({ orderId, orderRef }: { orderId: string; orderRef: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    const result = await cancelOrder({ orderId, reason });
    setPending(false);
    if (result.ok) {
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="text-danger! hover:bg-danger-soft!">
        {t("order.cancel.button", "Cancel request")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={t("order.cancel.title", "Cancel this request?")}
        description={t("order.cancel.confirm", "Request {ref} will be closed. You can always start a new one.", { ref: orderRef })}
        closeLabel={t("common.close", "Close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("order.cancel.keep", "Keep request")}
            </Button>
            <Button variant="danger" loading={pending} onClick={confirm}>
              {t("order.cancel.submit", "Yes, cancel it")}
            </Button>
          </>
        }
      >
        <Field label={t("order.cancel.reason", "Reason")} optionalLabel={t("form.optional", "Optional")}>
          <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}
