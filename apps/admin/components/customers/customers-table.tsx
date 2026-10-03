"use client";

import { Avatar, Badge, formatDate, formatPrice } from "@retexia/ui";
import { DataTable, type ColumnDef } from "@retexia/ui/admin";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ProductTag } from "@/components/common/status";
import { TableToolbar, useUrlSort, type FilterDef, type SavedView } from "@/components/table/table-toolbar";
import type { CustomerRow } from "@/lib/queries/customers";

export function CustomersTable({ rows, currency, views, filters, footer }: { rows: CustomerRow[]; currency: string; views: SavedView[]; filters: FilterDef[]; footer: ReactNode }) {
  const { sort, onSortChange } = useUrlSort();
  const columns = useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      {
        id: "full_name",
        header: "Name",
        meta: { sortable: true, label: "Name" },
        cell: ({ row }) => (
          <Link href={`/customers/${row.original.id}`} className="flex items-center gap-3 rounded-sm focus-visible:focus-ring">
            <Avatar name={row.original.full_name ?? row.original.email} size={30} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-link hover:text-brand-hover">{row.original.full_name || "No name"}</span>
              <span className="truncate type-small text-ink-muted">{row.original.business_name}</span>
            </span>
          </Link>
        ),
      },
      { id: "email", header: "Email", meta: { sortable: true, label: "Email" }, cell: ({ row }) => <span className="truncate">{row.original.email}</span> },
      { id: "phone", header: "Phone", meta: { label: "Phone" }, cell: ({ row }) => row.original.phone ?? row.original.whatsapp ?? <span className="text-ink-muted">—</span> },
      {
        id: "products",
        header: "Active products",
        meta: { label: "Active products" },
        cell: ({ row }) =>
          row.original.active_products?.length ? (
            <span className="flex flex-wrap gap-1">
              {row.original.active_products.map((slug) => (
                <ProductTag key={slug} slug={slug} name={slug} />
              ))}
            </span>
          ) : (
            <span className="text-ink-muted">—</span>
          ),
      },
      { id: "orders_count", header: "Requests", meta: { sortable: true, label: "Requests", className: "text-right" }, cell: ({ row }) => row.original.orders_count },
      {
        id: "lifetime_paid",
        header: "Lifetime paid",
        meta: { sortable: true, label: "Lifetime paid", className: "text-right" },
        cell: ({ row }) => <span className="whitespace-nowrap">{formatPrice(row.original.lifetime_paid, currency)}</span>,
      },
      { id: "created_at", header: "Joined", meta: { sortable: true, label: "Joined" }, cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.created_at)}</span> },
      {
        id: "last_sign_in_at",
        header: "Last sign-in",
        meta: { sortable: true, label: "Last sign-in" },
        cell: ({ row }) => (row.original.last_sign_in_at ? <span className="whitespace-nowrap">{formatDate(row.original.last_sign_in_at)}</span> : <span className="text-ink-muted">Never</span>),
      },
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) =>
          row.original.is_banned ? <Badge tone="danger">Banned</Badge> : row.original.email_confirmed_at ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Unconfirmed</Badge>,
      },
    ],
    [currency],
  );
  return (
    <DataTable
      caption="Customers"
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      storageKey="rx-columns-customers"
      sort={sort}
      onSortChange={onSortChange}
      toolbar={<TableToolbar searchPlaceholder="Search name, email, phone, business" filters={filters} views={views} exportHref="/api/export/customers" />}
      footer={footer}
      empty={<p className="px-6 py-12 text-center type-body text-ink-muted">No customers match.</p>}
    />
  );
}
