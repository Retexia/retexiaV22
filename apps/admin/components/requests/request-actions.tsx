"use client";

import { Alert, Button, Dialog, DropdownMenu, Field, Input, Switch, Textarea } from "@retexia/ui";
import { ChevronDown, Eye, Mail, MessageCircle, MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { assignOrders, changeStatus } from "@/app/(panel)/requests/actions";

export type TransitionOption = {
  to_status: string;
  to_label: string;
  action_label: string;
  requires_confirmed_payment: boolean;
  requires_reason: boolean;
  notify_customer_default: boolean;
  customer_note_template: string | null;
  allowed: boolean;
};

const PRIORITY = ["reviewing", "awaiting_payment", "setting_up", "active"];

/** Status buttons (primary = most likely next step), assignee picker and quick links. */
export function RequestActions({
  orderId,
  orderRef,
  transitions,
  hasConfirmedPayment,
  canOverride,
  canOperate,
  assignee,
  team,
  links,
}: {
  orderId: string;
  orderRef: string;
  transitions: TransitionOption[];
  hasConfirmedPayment: boolean;
  canOverride: boolean;
  canOperate: boolean;
  assignee: string | null;
  team: { id: string; name: string }[];
  links: { customerView: string; whatsapp: string | null; email: string | null; panel: string | null };
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<TransitionOption | null>(null);
  const allowed = transitions.filter((t) => t.allowed);
  const primary =
    allowed.find((t) => PRIORITY.includes(t.to_status) && t.to_status !== "cancelled" && t.to_status !== "rejected") ??
    allowed.find((t) => t.to_status !== "cancelled" && t.to_status !== "rejected");
  const others = allowed.filter((t) => t !== primary);

  return (
    <>
      {canOperate ? (
        <label className="flex items-center gap-2">
          <span className="sr-only">Assigned to</span>
          <select
            value={assignee ?? ""}
            onChange={async (e) => {
              const r = await assignOrders({ ids: [orderId], userId: e.target.value || null });
              toast[r.ok ? "success" : "error"](r.message ?? "");
              router.refresh();
            }}
            className="h-9 max-w-[180px] rounded-full border border-line-strong bg-surface-raised px-3 type-label text-ink focus-visible:focus-ring"
          >
            <option value="">Unassigned</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <DropdownMenu
        triggerLabel="More actions"
        triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 type-label text-ink transition-hover hover:border-line-strong focus-visible:focus-ring"
        trigger={
          <>
            More <ChevronDown aria-hidden size={14} strokeWidth={1.5} />
          </>
        }
        items={[
          ...others.map((t) => ({ type: "button" as const, label: t.action_label, danger: ["cancelled", "rejected"].includes(t.to_status), onSelect: () => setChosen(t) })),
          ...(others.length ? [{ type: "separator" as const }] : []),
          { href: links.customerView, label: "Open customer's view", icon: <Eye aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 text-ink-muted" /> },
          ...(links.whatsapp ? [{ href: links.whatsapp, label: "Message on WhatsApp", icon: <MessageCircle aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 text-ink-muted" /> }] : []),
          ...(links.email ? [{ href: links.email, label: "Email customer", icon: <Mail aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 text-ink-muted" /> }] : []),
          ...(links.panel ? [{ href: links.panel, label: "Open product panel", icon: <MonitorSmartphone aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 text-ink-muted" /> }] : []),
        ]}
      />
      {primary ? (
        <Button onClick={() => setChosen(primary)}>{primary.action_label}</Button>
      ) : canOperate ? null : (
        <span className="type-small text-ink-muted">View only</span>
      )}
      <StatusChangeDialog
        key={chosen?.to_status ?? "none"}
        orderId={orderId}
        orderRef={orderRef}
        transition={chosen}
        hasConfirmedPayment={hasConfirmedPayment}
        canOverride={canOverride}
        onClose={() => setChosen(null)}
        onDone={() => {
          setChosen(null);
          router.refresh();
        }}
      />
    </>
  );
}

function StatusChangeDialog({
  orderId,
  orderRef,
  transition,
  hasConfirmedPayment,
  canOverride,
  onClose,
  onDone,
}: {
  orderId: string;
  orderRef: string;
  transition: TransitionOption | null;
  hasConfirmedPayment: boolean;
  canOverride: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [customerNote, setCustomerNote] = useState(transition?.customer_note_template ?? "");
  const [internalNote, setInternalNote] = useState("");
  const [notify, setNotify] = useState(transition?.notify_customer_default ?? true);
  const [override, setOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const needsPayment = Boolean(transition?.requires_confirmed_payment && !hasConfirmedPayment);
  const danger = transition && ["cancelled", "rejected"].includes(transition.to_status);

  return (
    <Dialog
      open={Boolean(transition)}
      onOpenChange={(o) => !o && onClose()}
      title={transition ? `${transition.action_label}: ${orderRef}` : ""}
      description={transition ? `The request moves to “${transition.to_label}”. The customer sees the note below on their timeline.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={pending}
            disabled={(needsPayment && !canOverride) || (needsPayment && !override.trim())}
            onClick={async () => {
              if (!transition) return;
              setError(null);
              setPending(true);
              const r = await changeStatus({
                orderId,
                ref: orderRef,
                toStatus: transition.to_status,
                customerNote,
                internalNote,
                notify,
                overrideReason: needsPayment ? override : undefined,
              });
              setPending(false);
              if (r.ok) {
                toast.success(r.message ?? "Updated");
                onDone();
              } else setError(r.message);
            }}
          >
            {transition?.action_label ?? "Save"}
          </Button>
        </>
      }
    >
      {transition ? (
        <div className="flex flex-col gap-5">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {needsPayment ? (
            <Alert tone="warning" title="No confirmed payment yet">
              {canOverride
                ? "Record and confirm the payment first, or give a reason to go ahead without it. The reason is saved as an internal note."
                : "Record and confirm the payment first. Only an admin can go ahead without it."}
            </Alert>
          ) : null}
          <Field
            label="Note for the customer"
            hint="Shown on their timeline and in the notification."
            required={transition.requires_reason}
            optionalLabel="Optional"
          >
            <Textarea rows={4} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
          </Field>
          <Field label="Internal note" hint="Only the team sees this." optionalLabel="Optional">
            <Textarea rows={3} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
          </Field>
          {needsPayment && canOverride ? (
            <Field label="Reason to go ahead without a payment" required>
              <Input value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Paid in cash at the office" />
            </Field>
          ) : null}
          <Switch checked={notify} onCheckedChange={setNotify} label="Notify the customer" description="Email (and WhatsApp, if switched on in Notifications)." />
        </div>
      ) : null}
    </Dialog>
  );
}
