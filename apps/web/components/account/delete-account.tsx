"use client";

import { Button, Card, Dialog, Field, Textarea, formatDate } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cancelAccountDeletion, requestAccountDeletion } from "@/app/(site)/account/actions";
import { useT } from "@/lib/strings-context";

/** Account → Security: ask the Retexia team to delete the account (or change your mind). */
export function DeleteAccount({ requestedAt }: { requestedAt: string | null }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const act = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (result.ok) {
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    } else toast.error(result.message);
  };
  return (
    <Card as="section" id="delete" aria-labelledby="delete-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="delete-title" className="type-h2 text-ink">
          {t("account.delete.title", "Delete my account")}
        </h2>
        {requestedAt ? (
          <p className="type-body text-ink-muted">
            {t("account.delete.pending", "You asked us to delete your account on {date}. We'll email you when it's done.").replace("{date}", formatDate(requestedAt))}
          </p>
        ) : (
          <p className="type-body text-ink-muted">
            {t("account.delete.text", "The Retexia team deletes your account and everything in it: your profile, requests, receipts and your products' data. You can change your mind until it's done.")}
          </p>
        )}
      </div>
      <div>
        {requestedAt ? (
          <Button variant="secondary" loading={pending} onClick={() => act(cancelAccountDeletion)}>
            {t("account.delete.keep", "Keep my account")}
          </Button>
        ) : (
          <Button variant="danger" onClick={() => setOpen(true)}>
            {t("account.delete.button", "Delete my account")}
          </Button>
        )}
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={t("account.delete.confirm_title", "Delete your account?")}
        description={t("account.delete.confirm_text", "Your products stop working and everything in your account is deleted. This can't be undone once we've done it.")}
        closeLabel={t("common.close", "Close")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button variant="danger" loading={pending} onClick={() => act(() => requestAccountDeletion({ reason }))}>
              {t("account.delete.confirm", "Delete my account")}
            </Button>
          </>
        }
      >
        <Field label={t("account.delete.reason", "Why are you leaving?")} hint={t("account.delete.reason_hint", "Helps us do better.")}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} />
        </Field>
      </Dialog>
    </Card>
  );
}
