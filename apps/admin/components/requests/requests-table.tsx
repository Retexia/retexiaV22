"use client";

import type { StaffRole } from "@retexia/supabase";
import { Alert, Button, Dialog, Field, Input, Select, Switch, Textarea, formatDate, formatPrice } from "@retexia/ui";
import { DataTable, type ColumnDef } from "@retexia/ui/admin";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { assignOrders, bulkChangeStatus, bulkSetAnyStatus, deleteRequests } from "@/app/(panel)/requests/actions";
import { OrderStatus, ProductTag, label } from "@/components/common/status";
import { TableToolbar, useUrlSort, type FilterDef, type SavedView } from "@/components/table/table-toolbar";
import type { RequestRow } from "@/lib/queries/requests";

type Transition = { from_status: string; to_status: string; action_label: string; min_roles: string[] };

export function RequestsTable({
  rows,
  canOperate,
  canAdmin,
  statuses,
  role,
  transitions,
  team,
  views,
  filters,
  footer,
  emptyText,
}: {
  rows: RequestRow[];
  canOperate: boolean;
  /** Admins and owners: any status, delete. */
  canAdmin: boolean;
  statuses: { key: string; label: string }[];
  role: StaffRole;
  transitions: Transition[];
  team: { id: string; name: string }[];
  views: SavedView[];
  filters: FilterDef[];
  footer: ReactNode;
  emptyText: string;
}) {
  const router = useRouter();
  const { sort, onSortChange } = useUrlSort();
  const [bulk, setBulk] = useState<{ ids: string[]; clear: () => void } | null>(null);
  const [toStatus, setToStatus] = useState("");
  const [notify, setNotify] = useState(true);
  const [pending, setPending] = useState(false);
  // Admin: any status (skips the usual steps) and delete, both with a reason.
  const [anyMode, setAnyMode] = useState(false);
  const [reason, setReason] = useState("");
  const [toDelete, setToDelete] = useState<{ ids: string[]; clear: () => void } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const columns = useMemo<ColumnDef<RequestRow>[]>(
    () => [
      {
        id: "ref",
        header: "Ref",
        meta: { sortable: true, label: "Ref" },
        cell: ({ row }) => (
          <Link href={`/requests/${encodeURIComponent(row.original.ref ?? "")}`} className="rounded-sm type-code text-link hover:text-brand-hover focus-visible:focus-ring">
            {row.original.ref}
          </Link>
        ),
      },
      {
        id: "customer_name",
        header: "Customer",
        meta: { sortable: true, label: "Customer" },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate">{row.original.customer_name ?? "Deleted customer"}</span>
            <span className="truncate type-small text-ink-muted">{row.original.customer_business ?? row.original.customer_email}</span>
          </div>
        ),
      },
      { id: "product", header: "Product", meta: { label: "Product" }, cell: ({ row }) => <ProductTag slug={row.original.product_slug} name={row.original.product_short_name} /> },
      { id: "package_name", header: "Package", meta: { sortable: true, label: "Package" }, cell: ({ row }) => row.original.package_name },
      {
        id: "status",
        header: "Status",
        meta: { sortable: true, label: "Status" },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <OrderStatus label={row.original.status_label} tone={row.original.status_tone} fallback={row.original.status} />
            {row.original.pending_payments ? <span className="type-small text-warning">Proof</span> : null}
          </span>
        ),
      },
      { id: "billing", header: "Billing", meta: { label: "Billing" }, cell: ({ row }) => label(row.original.billing_cycle) },
      {
        id: "price_amount",
        header: "Price",
        meta: { sortable: true, label: "Price", className: "text-right" },
        cell: ({ row }) => <span className="whitespace-nowrap">{formatPrice(row.original.price_amount, row.original.currency ?? "LKR")}</span>,
      },
      { id: "assignee", header: "Assigned to", meta: { label: "Assigned to" }, cell: ({ row }) => row.original.assignee_name ?? <span className="text-ink-muted">—</span> },
      { id: "source", header: "Source", meta: { label: "Source" }, cell: ({ row }) => label(row.original.source) },
      { id: "created_at", header: "Submitted", meta: { sortable: true, label: "Submitted" }, cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.created_at)}</span> },
      {
        id: "renews_at",
        header: "Renews",
        meta: { sortable: true, label: "Renews" },
        cell: ({ row }) => {
          const r = row.original.renews_at;
          if (!r || row.original.status !== "active") return <span className="text-ink-muted">—</span>;
          const overdue = new Date(r).getTime() < Date.now();
          return <span className={overdue ? "whitespace-nowrap text-danger" : "whitespace-nowrap"}>{formatDate(r)}</span>;
        },
      },
    ],
    [],
  );

  // Transitions valid for every selected request (same target from each status).
  const sharedTargets = (ids: string[]) => {
    const statuses = new Set(rows.filter((r) => ids.includes(r.id)).map((r) => r.status ?? ""));
    const allowed = transitions.filter((t) => t.min_roles.includes(role));
    const targets = new Map<string, string>();
    for (const t of allowed) targets.set(t.to_status, t.action_label);
    return [...targets.entries()].filter(([to]) => [...statuses].every((from) => allowed.some((t) => t.from_status === from && t.to_status === to)));
  };

  return (
    <>
      <DataTable
        caption="Requests"
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        storageKey="rx-columns-requests"
        sort={sort}
        onSortChange={onSortChange}
        toolbar={<TableToolbar searchPlaceholder="Search ref, name, email, phone" filters={filters} views={views} exportHref="/api/export/requests" />}
        footer={footer}
        empty={<p className="px-6 py-12 text-center type-body text-ink-muted">{emptyText}</p>}
        bulkActions={(ids, clear) => (
          <>
            {canOperate ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setBulk({ ids, clear })}>
                  Change status
                </Button>
                {canAdmin ? (
                  <Button size="sm" variant="ghost" onClick={() => setToDelete({ ids, clear })}>
                    Delete
                  </Button>
                ) : null}
                <label className="flex items-center gap-2 type-label text-ink">
                  <span className="sr-only">Assign to</span>
                  <select
                    defaultValue=""
                    onChange={async (e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const r = await assignOrders({ ids, userId: v === "none" ? null : v });
                      toast[r.ok ? "success" : "error"](r.message ?? "");
                      e.target.value = "";
                      clear();
                      router.refresh();
                    }}
                    className="h-8 rounded-full border border-line-strong bg-surface-raised px-3 type-label"
                  >
                    <option value="">Assign to…</option>
                    <option value="none">Nobody</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <Button size="sm" variant="ghost" href={`/api/export/requests?ids=${ids.join(",")}`}>
              Export selected
            </Button>
          </>
        )}
      />
      <Dialog
        open={Boolean(bulk)}
        onOpenChange={(o) => {
          if (!o) {
            setBulk(null);
            setAnyMode(false);
            setReason("");
          }
        }}
        title={`Change status of ${bulk?.ids.length ?? 0} request${bulk?.ids.length === 1 ? "" : "s"}`}
        description={
          anyMode
            ? "Admin: set any status, skipping the usual steps and payment checks. Linked panels follow (Active turns them on, Cancelled stops them)."
            : "Only changes that are allowed for every selected request are listed. Requests that need a payment or setup fields first are skipped with a reason."
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setBulk(null);
                setAnyMode(false);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={!toStatus || (anyMode && reason.trim().length < 3)}
              onClick={async () => {
                if (!bulk) return;
                setPending(true);
                const r = anyMode ? await bulkSetAnyStatus({ ids: bulk.ids, toStatus, reason, notify }) : await bulkChangeStatus({ ids: bulk.ids, toStatus, notify });
                setPending(false);
                toast[r.ok ? "success" : "error"](r.message ?? "");
                bulk.clear();
                setBulk(null);
                setToStatus("");
                setAnyMode(false);
                setReason("");
                router.refresh();
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        {bulk ? (
          <div className="flex flex-col gap-4">
            {anyMode ? (
              <>
                <Field label="New status" required>
                  <Select value={toStatus} onChange={(e) => setToStatus(e.target.value)} options={statuses.map((st) => ({ value: st.key, label: st.label }))} placeholder="Choose a status" />
                </Field>
                <Field label="Reason" hint="Saved in the request notes and the audit log." required>
                  <Input value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cancelled by mistake" />
                </Field>
              </>
            ) : sharedTargets(bulk.ids).length ? (
              <Field label="New status" required>
                <Select
                  value={toStatus}
                  onChange={(e) => setToStatus(e.target.value)}
                  options={sharedTargets(bulk.ids).map(([to, actionLabel]) => ({ value: to, label: `${actionLabel} (${label(to)})` }))}
                />
              </Field>
            ) : (
              <p className="type-body text-ink-muted">
                The selected requests have no usual next step in common{canAdmin ? ". As an admin you can set any status below." : ". Select requests that are in the same status."}
              </p>
            )}
            {canAdmin ? (
              <Switch
                checked={anyMode}
                onCheckedChange={(on) => {
                  setAnyMode(on);
                  setToStatus("");
                }}
                label="Set any status (admin)"
                description="Also out of Cancelled or Rejected. Skips the usual steps, payment and setup checks."
              />
            ) : null}
            <Switch checked={notify} onCheckedChange={setNotify} label="Notify customers" />
          </div>
        ) : null}
      </Dialog>
      <Dialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => {
          if (!o) {
            setToDelete(null);
            setReason("");
            setConfirmText("");
          }
        }}
        title={`Delete ${toDelete?.ids.length ?? 0} request${toDelete?.ids.length === 1 ? "" : "s"}?`}
        description="They are deleted for good, with their payments, receipts, timeline and notes. Open ones are cancelled first, so a linked Post business or Lingo bot stops."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setToDelete(null);
                setReason("");
                setConfirmText("");
              }}
            >
              Keep them
            </Button>
            <Button
              variant="danger"
              loading={pending}
              disabled={confirmText.trim().toUpperCase() !== "DELETE" || reason.trim().length < 3}
              onClick={async () => {
                if (!toDelete) return;
                setPending(true);
                const r = await deleteRequests({ ids: toDelete.ids, reason });
                setPending(false);
                toast[r.ok ? "success" : "error"](r.message ?? "");
                toDelete.clear();
                setToDelete(null);
                setReason("");
                setConfirmText("");
                router.refresh();
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
          <Field label='Type "DELETE" to confirm' required>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
