import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../cn";

/** KPI tile: label, big number, optional hint. Clickable when href is set. */
export function StatCard({
  label,
  value,
  hint,
  href,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  icon?: ReactNode;
  tone?: "neutral" | "warning" | "danger" | "success";
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="type-label text-ink-muted">{label}</span>
        {icon ? <span className="text-ink-muted">{icon}</span> : null}
      </div>
      <span
        className={cn(
          "font-display text-[28px] leading-9 font-light tracking-[-0.015em]",
          tone === "neutral" && "text-ink",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </span>
      {hint ? <span className="type-small text-ink-muted">{hint}</span> : null}
    </>
  );
  const classes = cn(
    "flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface-raised p-5 shadow-soft",
    href && "transition-hover hover:border-line-strong focus-visible:focus-ring",
    className,
  );
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
