"use client";

import { Button, Dialog, StatusBadge, formatDate, formatPrice } from "@retexia/ui";
import { DataTable, type ColumnDef } from "@retexia/ui/admin";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { findRequests, type RequestOption } from "@/app/(panel)/payments/actions";
import { proofUrl, setPaymentStatus } from "@/app/(panel)/requests/actions";
import { ProductTag, label, paymentStatusTone } from "@/components/common/status";
import { RecordPaymentDialog } from "@/components/requests/payments-panel";
import { TableToolbar, useUrlSort, type FilterDef, type SavedView } from "@/components/table/table-toolbar";
import type { PaymentListRow } from "@/lib/queries/payments";

export function PaymentsTable({
  rows,
  canOperate,
  canAdmin,
  openRecord,
  views,
  filters,
  footer,
  emptyText,
}: {
  rows: PaymentListRow[];
  canOperate: boolean;
  canAdmin: boolean;
  openRecord: boolean;
  views: SavedView[];
  filters: FilterDef[];
  footer: ReactNode;
  emptyText: string;
}) {
  const router = useRouter();
  const { sort, onSortChange } = useUrlSort();
  const [pickOpen, setPickOpen] = useState(openRecord);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RequestOption[]>([]);
  const [target, setTarget] = useState<RequestOption | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    let active = true;
    const t = window.setTimeout(async () => {
      const r = await findRequests(query);
      if (active) setResults(r);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [query]);

  const act = async (id: string, status: "confirmed" | "refunded" | "failed") => {
    const r = await setPaymentStatus({ id, status });
    toast[r.ok ? "success" : "error"](r.message ?? "");
    router.refresh();
  };

  const columns = useMemo<ColumnDef<PaymentListRow>[]>(
    () => [
      { id: "created_at", header: "Date", meta: { sortable: true, label: "Date" }, cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.paid_at ?? row.original.created_at)}</span> },
      {
        id: "request",
        header: "Request",
        meta: { label: "Request" },
        cell: ({ row }) => (
          <Link href={`/requests/${encodeURIComponent(row.original.order_ref ?? "")}?tab=payments`} className="type-code text-link hover:text-brand-hover">
            {row.original.order_ref}
          </Link>
        ),
      },
      {
        id: "customer",
        header: "Customer",
        meta: { label: "Customer" },
        cell: ({ row }) => <span className="truncate">{row.original.customer_business || row.original.customer_name || "Deleted customer"}</span>,
      },
      { id: "product", header: "Product", meta: { label: "Product" }, cell: ({ row }) => <ProductTag slug={row.original.product_slug} name={row.original.product_short_name} /> },
      { id: "kind", header: "Kind", meta: { sortable: true, label: "Kind" }, cell: ({ row }) => label(row.original.kind) },
      {
        id: "amount",
        header: "Amount",
        meta: { sortable: true, label: "Amount", className: "text-right" },
        cell: ({ row }) => <span className="whitespace-nowrap">{formatPrice(row.original.signed_amount, row.original.currency ?? "LKR")}</span>,
      },
      { id: "method", header: "Method", meta: { label: "Method" }, cell: ({ row }) => label(row.original.method) },
      { id: "reference", header: "Reference", meta: { label: "Reference" }, cell: ({ row }) => row.original.reference ?? <span className="text-ink-muted">—</span> },
      { id: "status", header: "Status", meta: { sortable: true, label: "Status" }, cell: ({ row }) => <StatusBadge tone={paymentStatusTone[row.original.status] ?? "neutral"} label={label(row.original.status)} /> },
      {
        id: "receipt_number",
        header: "Receipt",
        meta: { sortable: true, label: "Receipt" },
        cell: ({ row }) =>
          row.original.receipt_number ? (
            <a href={`/print/receipt/${row.original.id}`} target="_blank" rel="noopener noreferrer" className="type-code text-link hover:text-brand-hover">
              {row.original.receipt_number}
            </a>
          ) : (
            <span className="text-ink-muted">—</span>
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableHiding: false,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <span className="flex justify-end gap-1">
              {p.proof_path ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const r = await proofUrl({ path: p.proof_path! });
                    if (r.ok && r.data) window.open(r.data, "_blank", "noopener");
                    else toast.error(r.ok ? "No file" : r.message);
                  }}
                >
                  Proof
                </Button>
              ) : null}
              {p.status === "pending" && canOperate ? (
                <Button size="sm" onClick={() => act(p.id, "confirmed")}>
                  Confirm
                </Button>
              ) : null}
              {p.status === "confirmed" && canAdmin ? (
                <Button size="sm" variant="ghost" onClick={() => window.confirm("Mark this payment as refunded?") && act(p.id, "refunded")}>
                  Refund
                </Button>
              ) : null}
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- act is stable enough per render
    [canOperate, canAdmin],
  );

  return (
    <>
      <DataTable
        caption="Payments"
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        storageKey="rx-columns-payments"
        sort={sort}
        onSortChange={onSortChange}
        toolbar={
          <>
            <TableToolbar searchPlaceholder="Search ref, receipt, customer" filters={filters} views={views} exportHref="/api/export/payments" />
            {canOperate ? (
              <Button size="sm" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setPickOpen(true)}>
                Record payment
              </Button>
            ) : null}
          </>
        }
        footer={footer}
        empty={<p className="px-6 py-12 text-center type-body text-ink-muted">{emptyText}</p>}
      />
      <Dialog open={pickOpen} onOpenChange={setPickOpen} title="Record a payment" description="Find the request it belongs to.">
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            aria-label="Search requests"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ref, name, email or phone"
            className="h-10 w-full rounded-md border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:border-brand focus-visible:focus-ring"
          />
          <ul className="flex flex-col">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTarget(r);
                    setPickOpen(false);
                  }}
                  className="flex w-full justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-sunk focus-visible:focus-ring"
                >
                  <span className="type-code text-ink">{r.ref}</span>
                  <span className="truncate type-small text-ink-muted">{r.customer}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
      {target ? (
        <RecordPaymentDialog
          order={{ id: target.id, ref: target.ref, userId: target.userId, currency: target.currency, price: target.price, setupFee: target.setupFee, billing: target.billing, renewsAt: target.renewsAt }}
          open
          onOpenChange={(o) => !o && setTarget(null)}
        />
      ) : null}
    </>
  );
}
