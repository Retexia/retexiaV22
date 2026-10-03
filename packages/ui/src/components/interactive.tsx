"use client";

import { ChevronDown, Monitor, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../cn";

/** True after hydration. Avoids a server/client mismatch for theme-dependent UI. */
export function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/* ------------------------------------------------------------------ Dialog */

/**
 * Accessible modal built on the native <dialog>: focus is trapped, the page
 * behind is inert, Esc and a backdrop click close it, and focus returns to the
 * element that opened it.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel = "Close",
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={() => onOpenChange(false)}
      onCancel={(e) => {
        e.preventDefault();
        onOpenChange(false);
      }}
      onClick={(e) => {
        if (e.target === ref.current) onOpenChange(false);
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] overflow-visible rounded-lg border border-line bg-surface-raised p-0 text-ink shadow-float backdrop:bg-ink/30 backdrop:backdrop-blur-[2px] open:animate-[rx-pop-in_220ms_var(--ease-out)]",
        size === "sm" && "max-w-[400px]",
        size === "md" && "max-w-[520px]",
        size === "lg" && "max-w-[720px]",
      )}
    >
      {open ? (
        <div className="flex max-h-[calc(100dvh-32px)] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="type-h2 text-ink">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="type-body text-ink-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="-mt-1 -mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-hover hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring"
            >
              <X aria-hidden size={18} strokeWidth={1.5} />
              <span className="sr-only">{closeLabel}</span>
            </button>
          </div>
          {children ? <div className="overflow-y-auto px-6 pt-4 pb-6">{children}</div> : <div className="pb-6" />}
          {footer ? (
            <div className="flex flex-col-reverse gap-3 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

/* ----------------------------------------------------------- DropdownMenu */

export type MenuItem =
  | { type?: "link"; label: ReactNode; href: string; icon?: ReactNode; description?: ReactNode }
  | { type: "button"; label: ReactNode; onSelect: () => void; icon?: ReactNode; danger?: boolean }
  | { type: "separator" };

/** Menu button with keyboard support (arrows, Home/End, Esc) that closes on outside click. */
export function DropdownMenu({
  trigger,
  triggerLabel,
  items,
  align = "end",
  triggerClassName,
  menuClassName,
  header,
}: {
  trigger: ReactNode;
  /** Accessible name when the trigger has no text. */
  triggerLabel?: string;
  items: MenuItem[];
  align?: "start" | "end" | "center";
  triggerClassName?: string;
  menuClassName?: string;
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const focusItem = useCallback((index: number | "first" | "last") => {
    const nodes = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (!nodes?.length) return;
    const list = Array.from(nodes);
    const i = index === "first" ? 0 : index === "last" ? list.length - 1 : (index + list.length) % list.length;
    list[i]?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    const frame = requestAnimationFrame(() => focusItem("first"));
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      cancelAnimationFrame(frame);
    };
  }, [open, focusItem]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem("first");
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem("last");
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const itemClass =
    "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left type-body text-ink transition-hover hover:bg-surface-sunk focus-visible:bg-surface-sunk focus-visible:outline-none";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute top-full z-50 mt-2 min-w-56 rounded-lg border border-line bg-surface-raised p-2 shadow-float animate-[rx-pop-in_140ms_var(--ease-out)]",
            align === "end" && "right-0",
            align === "start" && "left-0",
            align === "center" && "left-1/2 -translate-x-1/2",
            menuClassName,
          )}
        >
          {header ? <div className="px-3 pt-1 pb-2">{header}</div> : null}
          {items.map((item, i) => {
            if (item.type === "separator") return <div key={i} role="separator" className="my-1 h-px bg-line" />;
            if (item.type === "button") {
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close(false);
                    item.onSelect();
                  }}
                  className={cn(itemClass, item.danger && "text-danger")}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            }
            return (
              <Link key={i} href={item.href} role="menuitem" tabIndex={-1} onClick={() => close(false)} className={itemClass}>
                {item.icon}
                <span className="flex flex-col gap-0.5">
                  <span>{item.label}</span>
                  {item.description ? <span className="type-small text-ink-muted">{item.description}</span> : null}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- Tabs */

/** Tab list with roving focus (arrow keys). Render the matching panel yourself. */
export function Tabs({
  items,
  value,
  onValueChange,
  label,
  idPrefix,
  className,
}: {
  items: { value: string; label: ReactNode; count?: number }[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  /** Panels should use id `${idPrefix}-panel-${value}`. */
  idPrefix: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.value === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = items[next];
    if (!target) return;
    onValueChange(target.value);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-md bg-surface-sunk p-1", className)}
    >
      {items.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.value}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(t.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 type-label transition-ui focus-visible:focus-ring",
              selected ? "bg-surface-raised text-brand shadow-soft" : "text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span className={cn("type-small", selected ? "text-brand" : "text-ink-muted")}>{t.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- Accordion */

export function Accordion({
  items,
  className,
}: {
  items: { id: string; title: ReactNode; content: ReactNode }[];
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const baseId = useId();
  return (
    <div className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map((item) => {
        const open = openId === item.id;
        const buttonId = `${baseId}-${item.id}-button`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div key={item.id}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : item.id)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left type-h2 text-ink transition-hover hover:text-brand focus-visible:focus-ring"
              >
                <span>{item.title}</span>
                <ChevronDown
                  aria-hidden
                  size={20}
                  strokeWidth={1.5}
                  className={cn("shrink-0 text-ink-muted transition-ui", open && "rotate-180 text-brand")}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!open}
              className="pb-5 animate-[rx-fade-in_220ms_var(--ease-out)]"
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- ThemeToggle */

const themeOrder = ["light", "dark", "system"] as const;

/** Cycles light → dark → system. */
export function ThemeToggle({
  labels = { light: "Light theme", dark: "Dark theme", system: "System theme", switchTo: "Switch theme" },
  className,
}: {
  labels?: { light: string; dark: string; system: string; switchTo: string };
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = (mounted && themeOrder.includes(theme as never) ? theme : "system") as (typeof themeOrder)[number];
  const next = themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length] ?? "light";
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full text-ink-muted transition-hover hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring",
        className,
      )}
      title={`${labels[current]}. ${labels.switchTo}`}
    >
      <Icon aria-hidden size={18} strokeWidth={1.5} />
      <span className="sr-only">
        {labels[current]}. {labels.switchTo}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------- Toaster */

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      position="bottom-center"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[calc(100vw-32px)] max-w-[400px] items-start gap-3 rounded-lg border border-line bg-surface-raised p-4 text-ink shadow-float type-body",
          title: "type-h3 text-ink",
          description: "type-body text-ink-muted",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-brand",
          actionButton: "rounded-full bg-brand px-3 py-1 type-label text-on-brand",
          cancelButton: "rounded-full px-3 py-1 type-label text-ink-muted",
          closeButton: "text-ink-muted",
        },
      }}
    />
  );
}
