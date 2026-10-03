"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Columns3 } from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "../cn";
import { DropdownMenu } from "../components/interactive";

export type { ColumnDef } from "@tanstack/react-table";

export type SortState = { id: string; desc: boolean } | null;

type ColumnMeta = { className?: string; sortable?: boolean; label?: string };

function readStorage(key: string | undefined) {
  if (!key || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Remembers hidden columns per table in localStorage (per browser). */
function useColumnVisibility(storageKey?: string) {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener("rx-columns", notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener("rx-columns", notify);
    };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => readStorage(storageKey), () => null);
  const visibility = useMemo<VisibilityState>(() => {
    try {
      return raw ? (JSON.parse(raw) as VisibilityState) : {};
    } catch {
      return {};
    }
  }, [raw]);
  const setVisibility = (next: VisibilityState) => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event("rx-columns"));
    } catch {
      // storage blocked: visibility just doesn't persist
    }
  };
  return [visibility, setVisibility] as const;
}

/**
 * Admin data table: card with a sticky header on surface-sunk, 44px rows,
 * optional row selection with bulk actions, server-side sorting (the parent
 * keeps sort in the URL) and per-browser column visibility.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  selectable = false,
  bulkActions,
  sort,
  onSortChange,
  storageKey,
  empty,
  toolbar,
  footer,
  caption,
}: {
  data: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column value types vary per column
  columns: ColumnDef<T, any>[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  bulkActions?: (selectedIds: string[], clear: () => void) => ReactNode;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  /** localStorage key for hidden columns. */
  storageKey?: string;
  empty?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  /** Accessible table name. */
  caption: string;
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(storageKey);

  const allColumns = useMemo(() => {
    if (!selectable) return columns;
    const select: ColumnDef<T> = {
      id: "__select",
      enableHiding: false,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Select all rows on this page"
          className="size-4 accent-[var(--rx-brand)]"
          checked={table.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el) el.indeterminate = table.getIsSomePageRowsSelected();
          }}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label="Select row"
          className="size-4 accent-[var(--rx-brand)]"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
      meta: { className: "w-10" } satisfies ColumnMeta,
    };
    return [select, ...columns];
  }, [columns, selectable]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns new functions each render by design
  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId,
    state: { rowSelection, columnVisibility },
    enableRowSelection: selectable,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: (updater) =>
      setColumnVisibility(typeof updater === "function" ? updater(columnVisibility) : updater),
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && c.id !== "__select");

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        {hideable.length > 2 ? (
          <DropdownMenu
            triggerLabel="Show or hide columns"
            triggerClassName="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface-raised px-3 type-label text-ink-muted transition-hover hover:text-ink focus-visible:focus-ring"
            trigger={
              <>
                <Columns3 aria-hidden size={16} strokeWidth={1.5} />
                <span className="hidden sm:inline">Columns</span>
              </>
            }
            items={hideable.map((c) => ({
              type: "button" as const,
              label: (
                <span className="flex items-center gap-2">
                  <Check aria-hidden size={14} strokeWidth={2} className={c.getIsVisible() ? "text-brand" : "invisible"} />
                  {(c.columnDef.meta as ColumnMeta | undefined)?.label ?? c.id}
                  <span className="sr-only">{c.getIsVisible() ? "(shown)" : "(hidden)"}</span>
                </span>
              ),
              onSelect: () => c.toggleVisibility(),
            }))}
          />
        ) : null}
      </div>

      {selectable && selectedIds.length > 0 && bulkActions ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-3 rounded-md border border-brand/30 bg-brand-soft px-4 py-2"
        >
          <span className="type-label text-brand">{selectedIds.length} selected</span>
          {bulkActions(selectedIds, () => setRowSelection({}))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-line bg-surface-raised shadow-soft">
        <div className="max-h-[70dvh] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 z-10 bg-surface-sunk">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                    const sortable = Boolean(meta?.sortable && onSortChange);
                    const active = sort?.id === header.column.id;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={active ? (sort?.desc ? "descending" : "ascending") : undefined}
                        className={cn("h-10 border-b border-line px-3 type-label whitespace-nowrap text-ink-muted", meta?.className)}
                      >
                        {header.isPlaceholder ? null : sortable ? (
                          <button
                            type="button"
                            onClick={() =>
                              onSortChange?.(
                                !active ? { id: header.column.id, desc: false } : sort?.desc ? null : { id: header.column.id, desc: true },
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-sm hover:text-ink focus-visible:focus-ring"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {active ? (
                              sort?.desc ? (
                                <ArrowDown aria-hidden size={14} strokeWidth={1.5} />
                              ) : (
                                <ArrowUp aria-hidden size={14} strokeWidth={1.5} />
                              )
                            ) : (
                              <ArrowUpDown aria-hidden size={14} strokeWidth={1.5} className="opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    data-selected={row.getIsSelected() || undefined}
                    className="border-b border-line transition-hover last:border-b-0 hover:bg-surface-sunk/50 data-[selected]:bg-brand-soft/40"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn("h-11 px-3 py-2 type-body align-middle text-ink", (cell.column.columnDef.meta as ColumnMeta | undefined)?.className)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length} className="p-0">
                    {empty ?? <p className="px-6 py-12 text-center type-body text-ink-muted">Nothing here yet.</p>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {footer ? <div className="border-t border-line bg-surface-raised px-3 py-2">{footer}</div> : null}
      </div>
    </div>
  );
}
