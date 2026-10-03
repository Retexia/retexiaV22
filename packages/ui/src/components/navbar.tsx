"use client";

import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";
import { Button, isExternalHref } from "./button";
import { productStyle } from "./display";

export type NavProduct = {
  slug: string;
  name: string;
  tagline?: string | null;
  href: string;
  /** e.g. "Coming soon"; omitted for live products. */
  statusLabel?: string | null;
  icon?: ReactNode;
};

export type NavLinkSpec = {
  kind: "link" | "button";
  label: string;
  href: string;
  newTab?: boolean;
  /** Buttons only: shown instead when the visitor is signed in (e.g. "My account" → /account). */
  signedIn?: { label: string; href: string } | null;
};
export type NavProductsMenuSpec = {
  kind: "products_menu";
  label: string;
  products: NavProduct[];
  allHref?: string;
  allLabel?: string;
};
export type NavItem = NavLinkSpec | NavProductsMenuSpec;

function isActive(pathname: string, href: string) {
  if (isExternalHref(href) || href.includes("#")) return false;
  const path = href.split("?")[0] ?? href;
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
}

function NavLinkItem({ item, pathname, onNavigate, mobile }: {
  item: { label: string; href: string; newTab?: boolean };
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const active = isActive(pathname, item.href);
  const className = cn(
    "rounded-full transition-hover focus-visible:focus-ring",
    mobile ? "block px-3 py-3 type-body-lg" : "px-3 py-2 type-label",
    active ? "text-brand" : "text-ink-muted hover:text-ink",
  );
  const external = isExternalHref(item.href);
  if (external || item.newTab) {
    return (
      <a href={item.href} className={className} target={item.newTab ? "_blank" : undefined} rel="noopener noreferrer" onClick={onNavigate}>
        {item.label}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      {item.label}
    </Link>
  );
}

function ProductCard({ product, onNavigate }: { product: NavProduct; onNavigate?: () => void }) {
  return (
    <Link
      href={product.href}
      onClick={onNavigate}
      className="group flex items-start gap-3 rounded-md p-3 transition-hover hover:bg-surface-sunk focus-visible:focus-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={productStyle(product.slug)}>
        {product.icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 type-label text-ink">
          {product.name}
          {product.statusLabel ? (
            <span className="rounded-sm bg-surface-sunk px-1.5 py-px type-caption text-ink-muted">{product.statusLabel}</span>
          ) : null}
        </span>
        {product.tagline ? <span className="type-small text-ink-muted">{product.tagline}</span> : null}
      </span>
    </Link>
  );
}

function ProductsMenu({ item, pathname }: { item: NavProductsMenuSpec; pathname: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const active = item.products.some((p) => isActive(pathname, p.href));

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-3 py-2 type-label transition-hover focus-visible:focus-ring",
          active || open ? "text-brand" : "text-ink-muted hover:text-ink",
        )}
      >
        {item.label}
        <ChevronDown aria-hidden size={14} strokeWidth={1.5} className={cn("transition-ui", open && "rotate-180")} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full left-1/2 z-50 mt-2 w-[360px] -translate-x-1/2 rounded-lg border border-line bg-surface-raised p-2 shadow-float animate-[rx-pop-in_140ms_var(--ease-out)]"
      >
        <div className="flex flex-col">
          {item.products.map((p) => (
            <ProductCard key={p.slug} product={p} onNavigate={() => setOpen(false)} />
          ))}
        </div>
        {item.allHref ? (
          <Link
            href={item.allHref}
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center justify-between rounded-md border-t border-line px-3 pt-3 pb-2 type-label text-brand transition-hover hover:text-brand-hover focus-visible:focus-ring"
          >
            {item.allLabel ?? "All products"}
            <ArrowRight aria-hidden size={16} strokeWidth={1.5} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function DesktopLinks({ links, pathname }: { links: NavItem[]; pathname: string }) {
  return (
    <>
      {links.map((item, i) =>
        item.kind === "products_menu" ? (
          <ProductsMenu key={i} item={item} pathname={pathname} />
        ) : (
          <NavLinkItem key={i} item={item} pathname={pathname} />
        ),
      )}
    </>
  );
}

function DesktopLinksWithPath({ links }: { links: NavItem[] }) {
  return <DesktopLinks links={links} pathname={usePathname() ?? "/"} />;
}

function MobileLinks({ links, pathname, onNavigate }: { links: NavItem[]; pathname: string; onNavigate: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {links.map((item, i) =>
        item.kind === "products_menu" ? (
          <li key={i} className="pb-2">
            <p className="px-3 pt-2 pb-1 type-eyebrow text-ink-muted">{item.label}</p>
            <div className="flex flex-col">
              {item.products.map((p) => (
                <ProductCard key={p.slug} product={p} onNavigate={onNavigate} />
              ))}
            </div>
          </li>
        ) : (
          <li key={i}>
            <NavLinkItem item={item} pathname={pathname} onNavigate={onNavigate} mobile />
          </li>
        ),
      )}
    </ul>
  );
}

function MobileLinksWithPath(props: { links: NavItem[]; onNavigate: () => void }) {
  return <MobileLinks {...props} pathname={usePathname() ?? "/"} />;
}

/**
 * Sticky top navigation with a blurred surface. On small screens the links
 * move into a full-screen sheet (native modal dialog, so focus is trapped).
 */
export function NavBar({
  brand,
  items,
  actions,
  mobileActions,
  signedIn = false,
  labels = { openMenu: "Open menu", closeMenu: "Close menu", main: "Main" },
}: {
  brand: ReactNode;
  items: NavItem[];
  /** Right side on desktop (theme toggle, sign in / user menu). */
  actions?: ReactNode;
  /** Bottom of the mobile sheet (sign in / account links). */
  mobileActions?: ReactNode;
  /** Swaps buttons to their `signedIn` label and link. */
  signedIn?: boolean;
  labels?: { openMenu: string; closeMenu: string; main: string };
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetId = useId();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (menuOpen && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog.open) dialog.close();
  }, [menuOpen]);

  const links = items.filter((i) => i.kind !== "button");
  const buttons = items
    .filter((i): i is NavLinkSpec => i.kind === "button")
    .map((b) => (signedIn && b.signedIn ? { ...b, label: b.signedIn.label, href: b.signedIn.href } : b));
  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-surface/85 backdrop-blur-md transition-ui supports-[backdrop-filter]:bg-surface/70",
        scrolled ? "border-line" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[calc(var(--rx-container)_+_2_*_var(--rx-gutter))] items-center justify-between gap-4 px-gutter md:h-[72px]">
        <div className="flex min-w-0 flex-1 items-center">{brand}</div>

        <nav aria-label={labels.main} className="hidden items-center gap-1 md:flex">
          {/* The current path is request data on dynamic routes: stream it in. */}
          <Suspense fallback={<DesktopLinks links={links} pathname="" />}>
            <DesktopLinksWithPath links={links} />
          </Suspense>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {actions}
            {buttons.map((b, i) => (
              <Button key={i} href={b.href} size="sm" target={b.newTab ? "_blank" : undefined}>
                {b.label}
              </Button>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-ink transition-hover hover:bg-surface-sunk focus-visible:focus-ring md:hidden"
            aria-expanded={menuOpen}
            aria-controls={sheetId}
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden size={22} strokeWidth={1.5} />
            <span className="sr-only">{labels.openMenu}</span>
          </button>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        id={sheetId}
        aria-label={labels.main}
        onClose={closeMenu}
        onCancel={(e) => {
          e.preventDefault();
          closeMenu();
        }}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink open:animate-[rx-fade-in_220ms_var(--ease-out)] backdrop:bg-transparent md:hidden"
      >
        {menuOpen ? (
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between gap-4 px-gutter">
              <div className="flex min-w-0 items-center" onClick={closeMenu}>
                {brand}
              </div>
              <button
                type="button"
                onClick={closeMenu}
                className="inline-flex size-10 items-center justify-center rounded-full transition-hover hover:bg-surface-sunk focus-visible:focus-ring"
              >
                <X aria-hidden size={22} strokeWidth={1.5} />
                <span className="sr-only">{labels.closeMenu}</span>
              </button>
            </div>
            <nav aria-label={labels.main} className="flex-1 overflow-y-auto px-gutter pt-4 pb-8">
              <Suspense fallback={<MobileLinks links={links} pathname="" onNavigate={closeMenu} />}>
                <MobileLinksWithPath links={links} onNavigate={closeMenu} />
              </Suspense>
              <div className="mt-6 flex flex-col gap-3 border-t border-line pt-6" onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) closeMenu();
              }}>
                {buttons.map((b, i) => (
                  <Button key={i} href={b.href} size="lg" fullWidth>
                    {b.label}
                  </Button>
                ))}
                {mobileActions}
              </div>
            </nav>
          </div>
        ) : null}
      </dialog>
    </header>
  );
}
