"use client";

import { Button, Dialog, DropdownMenu, Field, Input } from "@retexia/ui";
import { Bookmark, Download, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteView, saveView } from "@/app/(panel)/view-actions";

export type FilterDef = { key: string; label: string; options: { value: string; label: string }[] };
export type SavedView = { id: string; name: string; query: string };

function useUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    if (!("page" in changes)) next.delete("page");
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return { sp, set, pathname };
}

/**
 * Search box, filter selects, saved views and CSV export. Everything lives in
 * the URL so a filtered list can be bookmarked or shared.
 */
export function TableToolbar({
  searchPlaceholder = "Search",
  filters = [],
  views,
  exportHref,
}: {
  searchPlaceholder?: string;
  filters?: FilterDef[];
  views?: SavedView[];
  /** e.g. /api/export/requests — the current query string is appended. */
  exportHref?: string;
}) {
  const { sp, set, pathname } = useUrl();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [, startTransition] = useTransition();
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  useEffect(() => {
    const current = sp.get("q") ?? "";
    if (q === current) return;
    const id = window.setTimeout(() => startTransition(() => set({ q: q.trim() || null })), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [q]);

  const query = sp.toString();
  const active = filters.some((f) => sp.get(f.key)) || Boolean(sp.get("q"));

  return (
    <>
      <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
        <Search aria-hidden size={16} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
        <input
          data-table-search
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-9 w-full rounded-full border border-line-strong bg-surface-raised pr-3 pl-9 type-body text-ink placeholder:text-ink-muted focus-visible:border-brand focus-visible:focus-ring"
        />
      </div>
      {filters.map((f) => (
        <label key={f.key} className="relative">
          <span className="sr-only">{f.label}</span>
          <select
            value={sp.get(f.key) ?? ""}
            onChange={(e) => set({ [f.key]: e.target.value || null })}
            className="h-9 max-w-[200px] appearance-none rounded-full border border-line-strong bg-surface-raised pr-8 pl-3 type-label text-ink focus-visible:border-brand focus-visible:focus-ring"
          >
            <option value="">{f.label}: all</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {f.label}: {o.label}
              </option>
            ))}
          </select>
          <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-ink-muted">
            ▼
          </span>
        </label>
      ))}
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          icon={<X aria-hidden size={14} strokeWidth={1.5} />}
          onClick={() => {
            setQ("");
            set(Object.fromEntries([...filters.map((f) => [f.key, null]), ["q", null]]));
          }}
        >
          Clear
        </Button>
      ) : null}
      {views ? (
        <DropdownMenu
          triggerLabel="Saved views"
          triggerClassName="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface-raised px-3 type-label text-ink-muted transition-hover hover:text-ink focus-visible:focus-ring"
          trigger={
            <>
              <Bookmark aria-hidden size={16} strokeWidth={1.5} />
              <span className="hidden sm:inline">Views</span>
            </>
          }
          align="start"
          items={[
            ...views.map((v) => ({ href: v.query ? `${pathname}?${v.query}` : pathname, label: v.name })),
            ...(views.length ? [{ type: "separator" as const }] : []),
            { type: "button" as const, label: "Save current view…", onSelect: () => setSaveOpen(true) },
            ...views.map((v) => ({
              type: "button" as const,
              danger: true,
              label: `Remove “${v.name}”`,
              onSelect: async () => {
                const r = await deleteView(v.id, pathname);
                toast[r.ok ? "success" : "error"](r.message ?? "");
              },
            })),
          ]}
        />
      ) : null}
      {exportHref ? (
        <Button href={`${exportHref}${query ? `?${query}` : ""}`} variant="secondary" size="sm" icon={<Download aria-hidden size={14} strokeWidth={1.5} />}>
          Export CSV
        </Button>
      ) : null}
      <Dialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        size="sm"
        title="Save this view"
        description="Saves the current search and filters for you."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const r = await saveView({ page: pathname, name: viewName, query: query.replace(/(^|&)page=\d+/, "") });
                toast[r.ok ? "success" : "error"](r.message ?? "");
                if (r.ok) {
                  setSaveOpen(false);
                  setViewName("");
                }
              }}
            >
              Save view
            </Button>
          </>
        }
      >
        <Field label="Name" required>
          <Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Lingo · awaiting payment" autoFocus />
        </Field>
      </Dialog>
    </>
  );
}

/** Column sorting that writes ?sort=column or ?sort=-column. */
export function useUrlSort() {
  const { sp, set } = useUrl();
  const raw = sp.get("sort");
  const sort = raw ? { id: raw.replace(/^-/, ""), desc: raw.startsWith("-") } : null;
  return {
    sort,
    onSortChange: (next: { id: string; desc: boolean } | null) => set({ sort: next ? `${next.desc ? "-" : ""}${next.id}` : null }),
  };
}
