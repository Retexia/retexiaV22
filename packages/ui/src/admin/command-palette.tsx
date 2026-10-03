"use client";

import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon?: ReactNode;
  keywords?: string[];
};
export type CommandGroup = { heading: string; items: CommandItem[] };

/**
 * ⌘K palette. Static groups (go to, quick actions) are filtered locally;
 * `onSearch` adds live results (requests, customers, ...) as you type.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  onSearch,
  onSelect,
  placeholder = "Search requests, customers, products, pages…",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandGroup[];
  onSearch?: (query: string) => Promise<CommandGroup[]>;
  onSelect: (item: CommandItem) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [live, setLive] = useState<CommandGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!onSearch || query.trim().length < 2) return;
    let cancelled = false;
    const id = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await onSearch(query.trim());
        if (!cancelled) setLive(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query, onSearch]);

  const shownLive = query.trim().length >= 2 ? live : [];
  const all = [...shownLive, ...groups];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
      label="Command palette"
      shouldFilter
      overlayClassName="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]"
      contentClassName="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-32px)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface-raised text-ink shadow-float"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search aria-hidden size={18} strokeWidth={1.5} className="text-ink-muted" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={placeholder}
          className="h-12 flex-1 bg-transparent type-body-lg text-ink outline-none placeholder:text-ink-muted"
        />
        {loading ? <span className="type-small text-ink-muted">Searching…</span> : null}
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center type-body text-ink-muted">No results.</Command.Empty>
        {all.map((group) =>
          group.items.length ? (
            <Command.Group
              key={group.heading}
              heading={group.heading}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:type-eyebrow [&_[cmdk-group-heading]]:text-ink-muted"
            >
              {group.items.map((item) => (
                <Command.Item
                  key={`${group.heading}:${item.id}`}
                  value={`${group.heading} ${item.label} ${item.hint ?? ""} ${(item.keywords ?? []).join(" ")}`}
                  onSelect={() => {
                    onSelect(item);
                    onOpenChange(false);
                    setQuery("");
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 type-body text-ink data-[selected=true]:bg-brand-soft data-[selected=true]:text-brand"
                >
                  {item.icon ? <span className="text-ink-muted">{item.icon}</span> : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint ? <span className="shrink-0 truncate type-small text-ink-muted">{item.hint}</span> : null}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null,
        )}
      </Command.List>
    </Command.Dialog>
  );
}
