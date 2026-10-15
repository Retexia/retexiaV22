"use client";

import { Alert, Button, Dialog, DropdownMenu, Field, Input, Select, Switch, Textarea } from "@retexia/ui";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRequests, setAnyStatus } from "@/app/(panel)/requests/actions";

/** Admins and owners: set any status (also out of Cancelled) or delete the request, each with a reason. */
export function AdminRequestTools({ orderId, orderRef, status, statuses }: { orderId: string; orderRef: string; status: string; statuses: { key: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<"status" | "delete" | null>(null);
  const [toStatus, setToStatus] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    setOpen(null);
    setToStatus("");
    setReason("");
    setNote("");
    setConfirm("");
  };

  return (
    <>
      <DropdownMenu
        triggerLabel="Admin tools"
        triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3 type-label text-ink hover:bg-surface-sunk focus-visible:focus-ring"
        trigger={
          <>
            <ShieldAlert aria-hidden size={14} strokeWidth={1.5} /> Admin
          </>
        }
        items={[
          { type: "button", label: "Set any status…", onSelect: () => setOpen("status") },
          { type: "button", label: "Delete request…", danger: true, onSelect: () => setOpen("delete") },
        ]}
      />

      <Dialog
        open={open === "status"}
        onOpenChange={(o) => !o && close()}
        title={`Set the status of ${orderRef}`}
        description="Any status, also out of Cancelled or Rejected. Skips the usual steps, payment and setup checks. A linked Post business or Lingo bot follows (Active turns it on, Cancelled stops it)."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!toStatus || reason.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                const r = await setAnyStatus({ orderId, ref: orderRef, toStatus, reason, customerNote: note, notify });
                setBusy(false);
                toast[r.ok ? "success" : "error"](r.message ?? "");
                if (r.ok) {
                  close();
                  router.refresh();
                }
              }}
            >
              Set status
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="New status" required>
            <Select
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value)}
              options={statuses.filter((st) => st.key !== status).map((st) => ({ value: st.key, label: st.label }))}
              placeholder="Choose a status"
            />
          </Field>
          <Field label="Reason" hint="Saved in the notes and the audit log (the customer doesn't see it)." required>
            <Input value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cancelled by mistake" />
          </Field>
          <Switch checked={notify} onCheckedChange={setNotify} label="Email the customer" />
          {notify ? (
            <Field label="Message to the customer" optionalLabel="Optional">
              <Textarea rows={3} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} />
            </Field>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={open === "delete"}
        onOpenChange={(o) => !o && close()}
        title={`Delete ${orderRef}?`}
        description="Deleted for good, with its payments, receipts, timeline and notes. If it is still open it is cancelled first, so a linked Post business or Lingo bot stops."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={confirm.trim() !== orderRef || reason.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                const r = await deleteRequests({ ids: [orderId], reason });
                setBusy(false);
                toast[r.ok ? "success" : "error"](r.message ?? "");
                if (r.ok) {
                  close();
                  router.push("/requests");
                  router.refresh();
                }
              }}
            >
              Delete for good
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Alert tone="danger">This can&apos;t be undone. The audit log keeps a record of what was deleted.</Alert>
          <Field label="Reason" hint="Saved in the audit log." required>
            <Textarea rows={2} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate request" />
          </Field>
          <Field label={`Type ${orderRef} to confirm`} required>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
