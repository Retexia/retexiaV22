"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "../cn";

export type PanelNavItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Number badge (hidden when 0 or null). */
  badge?: number | null;
  /** Small colour dot instead of an icon (e.g. a product colour). */
  dot?: string;
  /** Match only this exact path (default: path prefix). */
  exact?: boolean;
};
export type PanelNavGroup = { label?: string; items: PanelNavItem[] };

const COLLAPSE_KEY = "rx-panel-collapsed";

function useCollapsed() {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("rx-panel", notify);
    return () => window.removeEventListener("rx-panel", notify);
  }, []);
  const collapsed = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(COLLAPSE_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const toggle = () => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event("rx-panel"));
  };
  return [collapsed, toggle] as const;
}

function isActive(pathname: string, item: PanelNavItem) {
  const path = item.href.split("?")[0] ?? item.href;
  if (item.exact || path === "/") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavList({ groups, collapsed, onNavigate }: { groups: PanelNavGroup[]; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "/";
  // The most specific matching item wins (e.g. /products/new over /products).
  const all = groups.flatMap((g) => g.items);
  const activeHref = all
    .filter((i) => isActive(pathname, i))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group, gi) => (
        <div key={group.label ?? gi} className="flex flex-col gap-0.5">
          {group.label ? (
            <p className={cn("px-3 pb-1 type-eyebrow text-ink-muted", collapsed && "sr-only")}>{group.label}</p>
          ) : null}
          {group.items.map((item) => {
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-3 type-label transition-hover focus-visible:focus-ring",
                  active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-raised hover:text-ink",
                  collapsed && "justify-center px-0",
                )}
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  {item.dot ? (
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: item.dot }} />
                  ) : (
                    item.icon
                  )}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>{item.label}</span>
                {item.badge ? (
                  <span
                    className={cn(
                      "min-w-5 rounded-full bg-brand px-1.5 text-center text-[11px] leading-5 font-semibold text-on-brand",
                      collapsed && "absolute ml-6 -mt-5",
                    )}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Admin / product panel layout: fixed sidebar on surface-sunk (240px,
 * collapsible to icons, a drawer on phones), top bar, content up to 1280px.
 */
export function PanelShell({
  brand,
  groups,
  topbar,
  children,
}: {
  brand: ReactNode;
  groups: PanelNavGroup[];
  topbar: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = drawerRef.current;
    if (!d) return;
    if (drawerOpen && !d.open) d.showModal();
    if (!drawerOpen && d.open) d.close();
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh bg-surface">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-brand px-4 py-2 type-label text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface-sunk transition-ui lg:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex h-16 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
          {collapsed ? null : <div className="min-w-0 flex-1">{brand}</div>}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-hover hover:bg-surface-raised hover:text-ink focus-visible:focus-ring"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen aria-hidden size={18} strokeWidth={1.5} /> : <PanelLeftClose aria-hidden size={18} strokeWidth={1.5} />}
          </button>
        </div>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-6">
          <NavList groups={groups} collapsed={collapsed} />
        </nav>
      </aside>

      <dialog
        ref={drawerRef}
        aria-label="Admin menu"
        onClose={() => setDrawerOpen(false)}
        onCancel={(e) => {
          e.preventDefault();
          setDrawerOpen(false);
        }}
        onClick={(e) => {
          if (e.target === drawerRef.current) setDrawerOpen(false);
        }}
        className="m-0 h-dvh max-h-none w-[280px] max-w-[85vw] bg-surface-sunk p-0 text-ink shadow-float backdrop:bg-ink/30 lg:hidden"
      >
        {drawerOpen ? (
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between gap-2 px-4">
              <div className="min-w-0">{brand}</div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-raised focus-visible:focus-ring"
              >
                <X aria-hidden size={18} strokeWidth={1.5} />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-6">
              <NavList groups={groups} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
            </nav>
          </div>
        ) : null}
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md md:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-full text-ink hover:bg-surface-sunk focus-visible:focus-ring lg:hidden"
          >
            <Menu aria-hidden size={20} strokeWidth={1.5} />
            <span className="sr-only">Open menu</span>
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">{topbar}</div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[calc(var(--rx-container-wide)_+_48px)] flex-1 px-4 py-6 md:px-6 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
