import { Check, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-sunk text-ink-muted border border-line",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Inline style that colours an element with a product's colour pair. */
export function productStyle(slug: string | null | undefined): CSSProperties | undefined {
  if (!slug || !SLUG_RE.test(slug)) return undefined;
  return {
    color: `var(--product-${slug}, var(--rx-brand))`,
    backgroundColor: `var(--product-${slug}-soft, var(--rx-brand-soft))`,
  };
}

/** CSS variables that make `text-accent` / `bg-accent-soft` use a product's colours. */
export function productAccentVars(slug: string | null | undefined): CSSProperties | undefined {
  if (!slug || !SLUG_RE.test(slug)) return undefined;
  return {
    ["--accent" as string]: `var(--product-${slug}, var(--rx-brand))`,
    ["--accent-soft" as string]: `var(--product-${slug}-soft, var(--rx-brand-soft))`,
  } as CSSProperties;
}

/** Small uppercase label. Always pair colour with a word. */
export function Badge({
  tone = "neutral",
  productSlug,
  children,
  className,
}: {
  tone?: Tone | "product";
  productSlug?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 type-caption",
        tone !== "product" && toneClasses[tone],
        className,
      )}
      style={tone === "product" ? productStyle(productSlug) : undefined}
    >
      {children}
    </span>
  );
}

/** Order status with a dot and its label. */
export function StatusBadge({ tone = "neutral", label, className }: { tone?: Tone; label: string; className?: string }) {
  return (
    <Badge tone={tone} className={className}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}

/** Pill with a product's colour (reads --product-<slug> / --product-<slug>-soft). */
export function ProductChip({
  slug,
  name,
  icon,
  size = "md",
  className,
}: {
  slug: string;
  name: string;
  icon?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full type-label",
        size === "sm" ? "h-6 px-2.5 text-[12px]" : "h-7 px-3",
        className,
      )}
      style={productStyle(slug)}
    >
      {icon}
      {name}
    </span>
  );
}

export function Card({
  children,
  className,
  as: As = "div",
  padded = true,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: "div" | "article" | "section" | "li" | "aside"; padded?: boolean }) {
  return (
    <As
      className={cn("rounded-lg border border-line bg-surface-raised shadow-soft", padded && "p-6", className)}
      {...rest}
    >
      {children}
    </As>
  );
}

const alertIcons = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

const alertClasses = {
  info: "border-brand/20 bg-brand-soft text-ink [&_[data-alert-icon]]:text-brand",
  success: "border-success/20 bg-success-soft text-ink [&_[data-alert-icon]]:text-success",
  warning: "border-warning/20 bg-warning-soft text-ink [&_[data-alert-icon]]:text-warning",
  danger: "border-danger/20 bg-danger-soft text-ink [&_[data-alert-icon]]:text-danger",
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof alertIcons;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = alertIcons[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-start", alertClasses[tone], className)}
    >
      <div className="flex flex-1 items-start gap-3">
        <Icon data-alert-icon aria-hidden size={20} strokeWidth={1.5} className="mt-px shrink-0" />
        <div className="flex flex-col gap-1">
          {title ? <p className="type-h3 text-ink">{title}</p> : null}
          {children ? <div className="type-body text-ink-muted">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 pl-8 sm:pl-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</div>
      ) : null}
      <h2 className="type-h1 text-ink">{title}</h2>
      {children ? <div className="max-w-measure type-body-lg text-ink-muted">{children}</div> : null}
      {actions ? <div className="mt-3 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={style}
      className={cn("animate-[rx-pulse_1.6s_ease-in-out_infinite] rounded-md bg-surface-sunk", className)}
    />
  );
}

export function initials(name: string | null | undefined, fallback = "?") {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-medium text-brand",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny avatar from Supabase storage
        <img src={src} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Numbered progress (e.g. Step 1 of 3). */
export function Stepper({
  steps,
  current,
  onStepClick,
  label = "Progress",
  stepLabel = (n: number, total: number) => `Step ${n} of ${total}`,
}: {
  steps: { title: string }[];
  current: number;
  /** Lets people jump back to completed steps. */
  onStepClick?: (index: number) => void;
  label?: string;
  stepLabel?: (n: number, total: number) => string;
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-3">
      <p className="type-small text-ink-muted" aria-live="polite">
        {stepLabel(Math.min(current + 1, steps.length), steps.length)}
        {steps[current] ? <span className="sr-only">: {steps[current].title}</span> : null}
      </p>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          const clickable = Boolean(onStepClick) && state === "done";
          const inner = (
            <>
              <span
                aria-hidden
                className={cn(
                  "h-1 w-full rounded-full transition-ui",
                  state === "todo" ? "bg-line" : "bg-brand",
                )}
              />
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    state === "done" && "bg-brand text-on-brand",
                    state === "current" && "border border-brand text-brand",
                    state === "todo" && "border border-line-strong text-ink-muted",
                  )}
                >
                  {state === "done" ? <Check size={12} strokeWidth={2.5} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden truncate type-small sm:inline",
                    state === "todo" ? "text-ink-muted" : "text-ink",
                  )}
                >
                  {step.title}
                </span>
              </span>
            </>
          );
          return (
            <li key={step.title + i} aria-current={state === "current" ? "step" : undefined}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(i)}
                  className="flex w-full flex-col gap-2 rounded-sm text-left focus-visible:focus-ring"
                >
                  {inner}
                  <span className="sr-only">(completed, go back to this step)</span>
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  {inner}
                  {state === "done" ? <span className="sr-only">(completed)</span> : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
