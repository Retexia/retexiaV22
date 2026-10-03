"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { Alert, Button, Card, Dialog, DropdownMenu, Field, Input, Select, StatusBadge, Textarea, formatDate, formatPrice } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { MoreHorizontal, Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deletePayment, proofUrl, recordPayment, setPaymentStatus } from "@/app/(panel)/requests/actions";
import { label, paymentStatusTone } from "@/components/common/status";

export type PaymentRow = {
  id: string;
  kind: string;
  amount: number;
  currency: string | null;
  method: string;
  reference: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  period_start: string | null;
  period_end: string | null;
  receipt_number: string | null;
  proof_path: string | null;
  note: string | null;
};

export type PaymentOrder = {
  id: string;
  ref: string;
  userId: string | null;
  currency: string;
  price: number;
  setupFee: number;
  billing: string;
  renewsAt: string | null;
};

const KINDS = ["setup_fee", "subscription", "addon", "refund", "other"];
const METHODS = ["bank_transfer", "cash", "card", "online_gateway", "other"];
const today = () => new Date().toISOString().slice(0, 10);

function addCycle(date: string, billing: string) {
  const d = new Date(date);
  if (billing === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** Record a payment for a request: amount prefilled from the snapshot, optional proof file. */
export function RecordPaymentDialog({ order, open, onOpenChange }: { order: PaymentOrder; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [kind, setKind] = useState("setup_fee");
  const [amount, setAmount] = useState(String(order.setupFee + order.price));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(today());
  const periodFrom = order.renewsAt ? order.renewsAt.slice(0, 10) : today();
  const [periodStart, setPeriodStart] = useState(periodFrom);
  const [periodEnd, setPeriodEnd] = useState(addCycle(periodFrom, order.billing));
  const [status, setStatus] = useState<"confirmed" | "pending">("confirmed");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    if (file && (file.size > 10 * 1024 * 1024 || !/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(file.type))) {
      setError("Proof must be a PDF, PNG, JPG or WebP under 10 MB.");
      return;
    }
    setPending(true);
    let proofPath: string | undefined;
    if (file) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
      proofPath = `${order.userId ?? "no-customer"}/${order.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await createBrowserClient().storage.from("payment-proofs").upload(proofPath, file, { contentType: file.type });
      if (upErr) {
        setPending(false);
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
    }
    const r = await recordPayment({
      orderId: order.id,
      kind: kind as "setup_fee",
      amount: Number(amount),
      method: method as "bank_transfer",
      reference,
      paidAt,
      periodStart: kind === "subscription" ? periodStart : undefined,
      periodEnd: kind === "subscription" ? periodEnd : undefined,
      status,
      proofPath,
      note,
    });
    setPending(false);
    if (r.ok) {
      toast.success(r.message ?? "Recorded");
      onOpenChange(false);
      router.refresh();
    } else setError(r.message);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Record a payment for ${order.ref}`}
      description="Confirmed payments get a receipt number. A confirmed subscription payment moves the renewal date to the end of its period."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={pending} disabled={!(Number(amount) >= 0) || amount === ""} onClick={submit}>
            {status === "confirmed" ? "Record and confirm" : "Record as pending"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind" required>
            <Select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setAmount(String(e.target.value === "subscription" ? order.price : e.target.value === "setup_fee" ? order.setupFee + order.price : 0));
              }}
              options={KINDS.map((k) => ({ value: k, label: label(k) }))}
            />
          </Field>
          <Field label={`Amount (${order.currency})`} hint={kind === "setup_fee" ? "Setup fee + first period by default." : undefined} required>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Method" required>
            <Select value={method} onChange={(e) => setMethod(e.target.value)} options={METHODS.map((m) => ({ value: m, label: label(m) }))} />
          </Field>
          <Field label="Reference" optionalLabel="Optional">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference" />
          </Field>
          <Field label="Paid on" required>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
          <Field label="Status" required>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as "confirmed")}
              options={[
                { value: "confirmed", label: "Confirmed (money received)" },
                { value: "pending", label: "Pending (check later)" },
              ]}
            />
          </Field>
          {kind === "subscription" ? (
            <>
              <Field label="Period from" required>
                <Input
                  type="date"
                  value={periodStart}
                  onChange={(e) => {
                    setPeriodStart(e.target.value);
                    setPeriodEnd(addCycle(e.target.value, order.billing));
                  }}
                />
              </Field>
              <Field label="Period to" hint="Becomes the new renewal date." required>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        <Field label="Proof" hint="PDF or image of the transfer, under 10 MB." optionalLabel="Optional">
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-3 type-body text-ink-muted hover:border-brand">
            <Upload aria-hidden size={18} strokeWidth={1.5} />
            <span className="truncate">{file ? file.name : "Choose a file"}</span>
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </Field>
        <Field label="Note" optionalLabel="Optional">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** A request's payments with confirm, refund, proof and receipt actions. */
export function PaymentsPanel({
  order,
  payments,
  canOperate,
  canAdmin,
}: {
  order: PaymentOrder;
  payments: PaymentRow[];
  canOperate: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const [recordOpen, setRecordOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PaymentRow | null>(null);
  const total = payments
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + (p.kind === "refund" ? -Number(p.amount) : Number(p.amount)), 0);

  const act = async (id: string, status: "confirmed" | "refunded" | "failed") => {
    const r = await setPaymentStatus({ id, status });
    toast[r.ok ? "success" : "error"](r.message ?? "");
    router.refresh();
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="type-h2 text-ink">Payments</h2>
          <p className="type-body text-ink-muted">Confirmed total: {formatPrice(total, order.currency)}</p>
        </div>
        {canOperate ? (
          <Button icon={<Plus aria-hidden size={16} strokeWidth={1.5} />} onClick={() => setRecordOpen(true)}>
            Record payment
          </Button>
        ) : null}
      </div>
      {payments.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="type-label text-ink">{formatPrice(p.amount, p.currency ?? order.currency)}</span>
                  <StatusBadge tone={paymentStatusTone[p.status] ?? "neutral"} label={label(p.status)} />
                  <span className="type-small text-ink-muted">{label(p.kind)}</span>
                  {p.receipt_number ? <span className="type-code text-ink-muted">{p.receipt_number}</span> : null}
                </span>
                <span className="type-small text-ink-muted">
                  {label(p.method)}
                  {p.reference ? ` · ${p.reference}` : ""} · {formatDate(p.paid_at ?? p.created_at)}
                  {p.period_end ? ` · period to ${formatDate(p.period_end)}` : ""}
                </span>
                {p.note ? <span className="type-small text-ink-muted">{p.note}</span> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {p.status === "pending" && canOperate ? (
                  <Button size="sm" onClick={() => act(p.id, "confirmed")}>
                    Confirm
                  </Button>
                ) : null}
                {p.receipt_number ? (
                  <Button size="sm" variant="secondary" href={`/print/receipt/${p.id}`} target="_blank">
                    Receipt
                  </Button>
                ) : null}
                <DropdownMenu
                  triggerLabel="Payment actions"
                  triggerClassName="inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunk focus-visible:focus-ring"
                  trigger={<MoreHorizontal aria-hidden size={16} strokeWidth={1.5} />}
                  items={[
                    ...(p.proof_path
                      ? [
                          {
                            type: "button" as const,
                            label: "View proof",
                            onSelect: async () => {
                              const r = await proofUrl({ path: p.proof_path! });
                              if (r.ok && r.data) window.open(r.data, "_blank", "noopener");
                              else toast.error(r.ok ? "No file" : r.message);
                            },
                          },
                        ]
                      : []),
                    ...(p.status === "pending" && canOperate ? [{ type: "button" as const, label: "Mark as failed", onSelect: () => act(p.id, "failed") }] : []),
                    ...(p.status === "confirmed" && canAdmin ? [{ type: "button" as const, label: "Mark as refunded", danger: true, onSelect: () => act(p.id, "refunded") }] : []),
                    ...(canAdmin ? [{ type: "button" as const, label: "Delete", danger: true, onSelect: () => setToDelete(p) }] : []),
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center type-body text-ink-muted">No payments yet.</p>
      )}
      {recordOpen ? <RecordPaymentDialog order={order} open={recordOpen} onOpenChange={setRecordOpen} /> : null}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this payment?"
        description="Use this only for mistakes. For money returned to the customer, mark it as refunded instead."
        confirmLabel="Delete payment"
        confirmText={toDelete?.receipt_number ?? undefined}
        onConfirm={async () => {
          if (!toDelete) return;
          const r = await deletePayment({ id: toDelete.id });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          setToDelete(null);
          router.refresh();
        }}
      />
    </Card>
  );
}
