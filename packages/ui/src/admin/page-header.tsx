import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../cn";

/** Title row of an admin page: optional back link, title, chips, actions on the right. */
export function PageHeader({
  title,
  description,
  back,
  chips,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  chips?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {back ? (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1.5 self-start rounded-full type-label text-ink-muted transition-hover hover:text-ink focus-visible:focus-ring"
        >
          <ArrowLeft aria-hidden size={16} strokeWidth={1.5} />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {chips ? <div className="flex flex-wrap items-center gap-2">{chips}</div> : null}
          <h1 className="type-h1 break-words text-ink">{title}</h1>
          {description ? <div className="max-w-content type-body text-ink-muted">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Tabs that are links (detail pages), so each tab has its own URL. */
export function LinkTabs({
  items,
  label,
  className,
}: {
  items: { href: string; label: ReactNode; active: boolean; count?: number | null }[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("-mb-px flex gap-1 overflow-x-auto border-b border-line", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 type-label transition-hover focus-visible:focus-ring",
            item.active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {item.label}
          {typeof item.count === "number" ? (
            <span className={cn("rounded-full px-1.5 type-small", item.active ? "bg-brand-soft text-brand" : "bg-surface-sunk text-ink-muted")}>
              {item.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** Label / value rows. */
export function DescriptionList({
  items,
  columns = 1,
  className,
}: {
  items: { label: ReactNode; value: ReactNode; wide?: boolean }[];
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", columns === 2 && "sm:grid-cols-2", className)}>
      {items.map((item, i) => (
        <div key={i} className={cn("flex min-w-0 flex-col gap-0.5", item.wide && columns === 2 && "sm:col-span-2")}>
          <dt className="type-small text-ink-muted">{item.label}</dt>
          <dd className="type-body break-words text-ink">{item.value ?? <span className="text-ink-muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line bg-surface-sunk px-1 font-mono text-[11px] text-ink-muted">
      {children}
    </kbd>
  );
}
