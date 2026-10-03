import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "../cn";

/** Server-side pagination as links (page lives in the URL). */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const linkClass =
    "inline-flex size-8 items-center justify-center rounded-full text-ink-muted transition-hover hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring";
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between gap-3", className)}>
      <p className="type-small text-ink-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={linkClass} aria-label="Previous page">
            <ChevronLeft aria-hidden size={16} strokeWidth={1.5} />
          </Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-40")} aria-hidden>
            <ChevronLeft size={16} strokeWidth={1.5} />
          </span>
        )}
        <span className="px-2 type-small text-ink-muted">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={linkClass} aria-label="Next page">
            <ChevronRight aria-hidden size={16} strokeWidth={1.5} />
          </Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-40")} aria-hidden>
            <ChevronRight size={16} strokeWidth={1.5} />
          </span>
        )}
      </div>
    </nav>
  );
}
