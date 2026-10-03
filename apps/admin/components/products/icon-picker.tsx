"use client";

import { Button, Dialog, cn } from "@retexia/ui";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { useMemo, useState } from "react";

/** Pick a Lucide icon by name (stored as text, e.g. "message-circle"). */
export function IconPicker({ value, onChange, label = "Icon" }: { value: string; onChange: (name: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "-");
    return (q ? iconNames.filter((n) => n.includes(q)) : iconNames).slice(0, 96);
  }, [query]);
  const valid = (iconNames as readonly string[]).includes(value);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-label text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-md border border-line bg-surface-sunk text-ink">
          {valid ? <DynamicIcon name={value as IconName} size={20} strokeWidth={1.5} /> : <span className="type-small text-ink-muted">?</span>}
        </span>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {value ? value : "Choose icon"}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen} size="lg" title="Choose an icon" description="Search the Lucide icon set (outline icons).">
        <div className="flex flex-col gap-4">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. message, calendar, chart"
            aria-label="Search icons"
            className="h-10 w-full rounded-md border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:border-brand focus-visible:focus-ring"
          />
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {matches.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  title={name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border text-ink transition-hover hover:border-brand focus-visible:focus-ring",
                    name === value ? "border-brand bg-brand-soft text-brand" : "border-line",
                  )}
                >
                  <DynamicIcon name={name} size={20} strokeWidth={1.5} />
                  <span className="sr-only">{name}</span>
                </button>
              </li>
            ))}
          </ul>
          {!matches.length ? <p className="type-body text-ink-muted">No icon matches “{query}”.</p> : null}
        </div>
      </Dialog>
    </div>
  );
}
