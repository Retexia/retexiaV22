"use client";

import { Badge, Button, Card, CheckboxGroup, Dialog, Field, Input, Select, StatusBadge, Switch, Textarea, type Tone } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteStatus, deleteTransition, saveStatus, saveTransition } from "@/app/(panel)/settings/actions";

export type StatusRow = { key: string; label: string; description: string; tone: Tone; is_final: boolean; customer_can_cancel: boolean; is_visible: boolean; sort_order: number; orders: number };
export type TransitionRow = {
  id?: string;
  from_status: string;
  to_status: string;
  action_label: string;
  min_roles: ("support" | "editor" | "admin" | "owner")[];
  requires_confirmed_payment: boolean;
  requires_reason: boolean;
  notify_customer_default: boolean;
  customer_note_template: string;
};

const TONES = [
  { value: "neutral", label: "Grey" },
  { value: "brand", label: "Blue" },
  { value: "success", label: "Green" },
  { value: "warning", label: "Amber" },
  { value: "danger", label: "Red" },
];
const ROLES = [
  { value: "support", label: "Support" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
];
const CORE = ["submitted", "reviewing", "awaiting_payment", "setting_up", "active", "paused", "cancelled", "rejected"];

export function StatusesEditor({ statuses, transitions }: { statuses: StatusRow[]; transitions: (TransitionRow & { id: string })[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<(StatusRow & { isNew: boolean }) | null>(null);
  const [transition, setTransition] = useState<TransitionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeStatus, setRemoveStatus] = useState<StatusRow | null>(null);
  const [removeTransition, setRemoveTransition] = useState<TransitionRow | null>(null);
  const label = (k: string) => statuses.find((s) => s.key === k)?.label ?? k;
  const options = statuses.map((s) => ({ value: s.key, label: s.label }));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="type-h2 text-ink">Statuses</h2>
            <p className="type-small text-ink-muted">Labels and descriptions are what customers see on their order page.</p>
          </div>
          <Button
            size="sm"
            icon={<Plus aria-hidden size={14} strokeWidth={1.5} />}
            onClick={() => setStatus({ isNew: true, key: "", label: "", description: "", tone: "neutral", is_final: false, customer_can_cancel: false, is_visible: true, sort_order: (statuses.at(-1)?.sort_order ?? 0) + 1, orders: 0 })}
          >
            Add status
          </Button>
        </div>
        <ul className="flex flex-col divide-y divide-line">
          {statuses.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-3 py-3">
              <StatusBadge tone={s.tone} label={s.label} />
              <code className="type-code text-ink-muted">{s.key}</code>
              <span className="min-w-0 flex-1 truncate type-small text-ink-muted">{s.description}</span>
              <span className="flex gap-1.5">
                {s.is_final ? <Badge tone="neutral">Closed</Badge> : null}
                {s.customer_can_cancel ? <Badge tone="neutral">Customer can cancel</Badge> : null}
                {!s.is_visible ? <Badge tone="neutral">Hidden</Badge> : null}
                <Badge tone="neutral">{s.orders} requests</Badge>
              </span>
              <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setStatus({ ...s, isNew: false })}>
                Edit
              </Button>
              {!CORE.includes(s.key) ? (
                <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemoveStatus(s)}>
                  <span className="sr-only">Delete {s.label}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="type-h2 text-ink">Allowed changes</h2>
            <p className="type-small text-ink-muted">The buttons on a request. A change not listed here can’t be made from the admin.</p>
          </div>
          <Button
            size="sm"
            icon={<Plus aria-hidden size={14} strokeWidth={1.5} />}
            onClick={() =>
              setTransition({ from_status: statuses[0]?.key ?? "", to_status: statuses[1]?.key ?? "", action_label: "", min_roles: ["support", "admin", "owner"], requires_confirmed_payment: false, requires_reason: false, notify_customer_default: true, customer_note_template: "" })
            }
          >
            Add change
          </Button>
        </div>
        {statuses
          .filter((s) => transitions.some((t) => t.from_status === s.key))
          .map((s) => (
            <div key={s.key} className="flex flex-col gap-2">
              <h3 className="type-label text-ink-muted">From {s.label}</h3>
              <ul className="flex flex-col gap-1.5">
                {transitions
                  .filter((t) => t.from_status === s.key)
                  .map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line px-3 py-2">
                      <span className="type-label text-ink">{t.action_label}</span>
                      <span className="flex items-center gap-1 type-small text-ink-muted">
                        {label(t.from_status)} <ArrowRight aria-hidden size={12} strokeWidth={1.5} /> {label(t.to_status)}
                      </span>
                      <span className="flex flex-1 flex-wrap gap-1.5">
                        {t.requires_confirmed_payment ? <Badge tone="warning">Needs confirmed payment</Badge> : null}
                        {t.requires_reason ? <Badge tone="neutral">Asks for a reason</Badge> : null}
                        {t.notify_customer_default ? <Badge tone="brand">Tells the customer</Badge> : null}
                        <Badge tone="neutral">{t.min_roles.join(", ")}</Badge>
                      </span>
                      <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setTransition(t)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemoveTransition(t)}>
                        <span className="sr-only">Remove</span>
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
      </Card>

      <Dialog
        open={Boolean(status)}
        onOpenChange={(o) => !o && setStatus(null)}
        title={status?.isNew ? "New status" : `Edit ${status?.label}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatus(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!status) return;
                setBusy(true);
                const { orders: _o, ...row } = status;
                const r = await saveStatus(row);
                setBusy(false);
                toast[r.ok ? "success" : "error"](r.message ?? "");
                if (r.ok) {
                  setStatus(null);
                  router.refresh();
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {status ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label" required>
              <Input autoFocus value={status.label} onChange={(e) => setStatus({ ...status, label: e.target.value, key: status.isNew ? e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") : status.key })} />
            </Field>
            <Field label="Key" hint={status.isNew ? "Can't change later." : "Fixed."}>
              <Input className="font-mono" value={status.key} disabled={!status.isNew} onChange={(e) => setStatus({ ...status, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} />
            </Field>
            <Field label="What it means for the customer" optionalLabel="Optional" className="sm:col-span-2">
              <Textarea rows={2} value={status.description} onChange={(e) => setStatus({ ...status, description: e.target.value })} />
            </Field>
            <Field label="Colour">
              <Select value={status.tone} onChange={(e) => setStatus({ ...status, tone: (e.target.value || "neutral") as Tone })} options={TONES} />
            </Field>
            <Field label="Order in lists">
              <Input type="number" value={status.sort_order} onChange={(e) => setStatus({ ...status, sort_order: Number(e.target.value) || 0 })} />
            </Field>
            <div className="flex flex-col gap-3 sm:col-span-2">
              <Switch checked={status.is_final} onCheckedChange={(v) => setStatus({ ...status, is_final: v })} label="Closed (no more steps)" />
              <Switch checked={status.customer_can_cancel} onCheckedChange={(v) => setStatus({ ...status, customer_can_cancel: v })} label="Customer can cancel from their order page" />
              <Switch checked={status.is_visible} onCheckedChange={(v) => setStatus({ ...status, is_visible: v })} label="In use" />
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(transition)}
        onOpenChange={(o) => !o && setTransition(null)}
        size="lg"
        title={transition?.id ? `Edit “${transition.action_label}”` : "New allowed change"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransition(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!transition) return;
                setBusy(true);
                const r = await saveTransition(transition);
                setBusy(false);
                toast[r.ok ? "success" : "error"](r.message ?? "");
                if (r.ok) {
                  setTransition(null);
                  router.refresh();
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {transition ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From">
              <Select value={transition.from_status} onChange={(e) => setTransition({ ...transition, from_status: e.target.value })} options={options} />
            </Field>
            <Field label="To">
              <Select value={transition.to_status} onChange={(e) => setTransition({ ...transition, to_status: e.target.value })} options={options} />
            </Field>
            <Field label="Button text" required className="sm:col-span-2">
              <Input value={transition.action_label} onChange={(e) => setTransition({ ...transition, action_label: e.target.value })} placeholder="Approve" />
            </Field>
            <Field label="Who can do it" labelAs="legend" className="sm:col-span-2">
              <CheckboxGroup name="roles" options={ROLES} value={transition.min_roles} onChange={(v) => setTransition({ ...transition, min_roles: v as TransitionRow["min_roles"] })} columns={2} />
            </Field>
            <div className="flex flex-col gap-3 sm:col-span-2">
              <Switch checked={transition.requires_confirmed_payment} onCheckedChange={(v) => setTransition({ ...transition, requires_confirmed_payment: v })} label="Only after a confirmed payment" description="Admins and owners can override with a reason." />
              <Switch checked={transition.requires_reason} onCheckedChange={(v) => setTransition({ ...transition, requires_reason: v })} label="Ask for a reason" />
              <Switch checked={transition.notify_customer_default} onCheckedChange={(v) => setTransition({ ...transition, notify_customer_default: v })} label="Tell the customer (default)" />
            </div>
            <Field label="Message to the customer (starting text)" optionalLabel="Optional" className="sm:col-span-2">
              <Textarea rows={3} value={transition.customer_note_template} onChange={(e) => setTransition({ ...transition, customer_note_template: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(removeStatus)}
        onOpenChange={(o) => !o && setRemoveStatus(null)}
        title={`Delete ${removeStatus?.label}?`}
        description="Allowed changes to and from it are removed too."
        confirmLabel="Delete status"
        onConfirm={async () => {
          if (!removeStatus) return;
          const r = await deleteStatus({ key: removeStatus.key });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          setRemoveStatus(null);
          if (r.ok) router.refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(removeTransition)}
        onOpenChange={(o) => !o && setRemoveTransition(null)}
        title={`Remove “${removeTransition?.action_label}”?`}
        description="The button disappears from requests in that status."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removeTransition?.id) return;
          const r = await deleteTransition({ id: removeTransition.id });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          setRemoveTransition(null);
          if (r.ok) router.refresh();
        }}
      />
    </div>
  );
}
