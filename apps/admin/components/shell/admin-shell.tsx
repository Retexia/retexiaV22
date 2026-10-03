"use client";

import { can, roleLabels, type StaffRole } from "@retexia/supabase";
import { createBrowserClient } from "@retexia/supabase/browser";
import { Avatar, DropdownMenu, ThemeToggle } from "@retexia/ui";
import { CommandPalette, Kbd, PanelShell, type CommandGroup, type PanelNavGroup } from "@retexia/ui/admin";
import {
  ListChecks,
  BadgeCheck,
  Boxes,
  CircleHelp,
  ClipboardList,
  CreditCard,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  ListTree,
  LogOut,
  Megaphone,
  Palette,
  Plus,
  Quote,
  Receipt,
  ScrollText,
  Search,
  Settings,
  Shield,
  Type,
  Users,
  Webhook,
  Briefcase,
  Bell,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { searchEverything } from "@/app/(panel)/search-actions";
import { RealtimeBell } from "./realtime";

export type ShellProduct = { slug: string; name: string; short_name: string; color_light: string; status: string };

const icon = (Icon: typeof Search) => <Icon aria-hidden size={18} strokeWidth={1.5} />;

export function AdminShell({
  children,
  role,
  name,
  email,
  products,
  counts,
  webUrl,
}: {
  children: ReactNode;
  role: StaffRole;
  name: string;
  email: string;
  products: ShellProduct[];
  counts: { requests: number; messages: number };
  webUrl: string;
}) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pendingG = useRef(false);

  // Keyboard: ⌘K / Ctrl+K palette, "g d|r|c|p" go-to, "/" focuses the table search.
  useEffect(() => {
    let timer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>("[data-table-search]");
        if (search) {
          e.preventDefault();
          search.focus();
        }
        return;
      }
      if (pendingG.current) {
        pendingG.current = false;
        const go: Record<string, string> = { d: "/", r: "/requests", c: "/customers", p: "/products", i: "/inbox", m: "/payments" };
        if (go[e.key]) {
          e.preventDefault();
          router.push(go[e.key]!);
        }
        return;
      }
      if (e.key === "g") {
        pendingG.current = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => (pendingG.current = false), 1200);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [router]);

  const groups: PanelNavGroup[] = [
    {
      items: [
        { href: "/", label: "Dashboard", icon: icon(LayoutDashboard), exact: true },
        { href: "/requests", label: "Requests", icon: icon(ClipboardList), badge: counts.requests },
        { href: "/customers", label: "Customers", icon: icon(Users) },
        { href: "/payments", label: "Payments", icon: icon(CreditCard) },
        { href: "/inbox", label: "Inbox", icon: icon(Inbox), badge: counts.messages },
      ],
    },
    {
      label: "Products",
      items: [
        ...products.map((p) => ({ href: `/products/${p.slug}`, label: p.short_name, dot: `var(--product-${p.slug}, ${p.color_light})` })),
        { href: "/products", label: "All products", icon: icon(Boxes), exact: true },
        ...(can(role, "manageProducts")
          ? [
              { href: "/forms", label: "Onboarding forms", icon: icon(ListChecks) },
              { href: "/products/new", label: "New product", icon: icon(Plus) },
            ]
          : []),
      ],
    },
    ...(can(role, "editContent")
      ? [
          {
            label: "Website",
            items: [
              { href: "/website/pages", label: "Pages", icon: icon(FileText) },
              { href: "/website/navigation", label: "Navigation", icon: icon(ListTree) },
              { href: "/website/services", label: "Services", icon: icon(Briefcase) },
              { href: "/website/faqs", label: "FAQs", icon: icon(CircleHelp) },
              { href: "/website/testimonials", label: "Testimonials", icon: icon(Quote) },
              { href: "/website/media", label: "Media", icon: icon(ImageIcon) },
              { href: "/website/strings", label: "Text and labels", icon: icon(Type) },
            ],
          },
        ]
      : []),
    ...(can(role, "manageSettings")
      ? [
          {
            label: "Settings",
            items: [
              { href: "/settings/general", label: "General", icon: icon(Settings) },
              { href: "/settings/theme", label: "Theme", icon: icon(Palette) },
              { href: "/settings/payments", label: "Payments and invoices", icon: icon(Receipt) },
              { href: "/settings/statuses", label: "Order statuses", icon: icon(BadgeCheck) },
              { href: "/settings/notifications", label: "Notifications", icon: icon(Bell) },
              ...(can(role, "manageTeam")
                ? [
                    { href: "/settings/integrations", label: "Integrations", icon: icon(Webhook) },
                    { href: "/settings/team", label: "Team", icon: icon(Shield) },
                  ]
                : []),
              { href: "/settings/audit", label: "Audit log", icon: icon(ScrollText) },
            ],
          },
        ]
      : []),
  ];

  const staticGroups: CommandGroup[] = [
    {
      heading: "Go to",
      items: groups.flatMap((g) => g.items).map((i) => ({ id: i.href, label: i.label, href: i.href, icon: i.icon })),
    },
    {
      heading: "Quick actions",
      items: [
        ...(can(role, "operate")
          ? [
              { id: "new-request", label: "New request", href: "/requests/new", icon: icon(Plus) },
              { id: "record-payment", label: "Record payment", href: "/payments?record=1", icon: icon(CreditCard) },
            ]
          : []),
        ...(can(role, "manageProducts") ? [{ id: "new-product", label: "New product", href: "/products/new", icon: icon(Boxes) }] : []),
        { id: "website", label: "View website", href: webUrl, icon: icon(ExternalLink) },
      ],
    },
  ];

  return (
    <>
      <PanelShell
        brand={
          <span className="flex items-center gap-2">
            <span className="font-display text-[20px] text-brand">Retexia</span>
            <span className="rounded-sm bg-brand-soft px-1.5 py-0.5 type-caption text-brand">Admin</span>
          </span>
        }
        groups={groups}
        topbar={
          <>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface-raised px-3 text-left type-body text-ink-muted transition-hover hover:border-line-strong focus-visible:focus-ring md:max-w-[420px]"
            >
              <Search aria-hidden size={16} strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate">Search requests, customers…</span>
              <span className="hidden items-center gap-1 sm:flex">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <a
                href={webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-9 items-center gap-1.5 rounded-full px-3 type-label text-ink-muted transition-hover hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring md:inline-flex"
              >
                View website
                <ExternalLink aria-hidden size={14} strokeWidth={1.5} />
              </a>
              <RealtimeBell />
              <ThemeToggle />
              <DropdownMenu
                triggerLabel="Your account"
                triggerClassName="inline-flex rounded-full focus-visible:focus-ring"
                trigger={<Avatar name={name || email} size={34} />}
                header={
                  <div className="flex flex-col">
                    <span className="truncate type-label text-ink">{name || email}</span>
                    <span className="truncate type-small text-ink-muted">
                      {roleLabels[role]} · {email}
                    </span>
                  </div>
                }
                items={[
                  { href: "/account", label: "Password and sign-in", icon: icon(Shield) },
                  { href: webUrl, label: "View website", icon: icon(Megaphone) },
                  { type: "separator" },
                  {
                    type: "button",
                    label: "Sign out",
                    icon: icon(LogOut),
                    onSelect: async () => {
                      await createBrowserClient().auth.signOut();
                      router.replace("/login");
                      router.refresh();
                    },
                  },
                ]}
              />
            </div>
          </>
        }
      >
        {children}
      </PanelShell>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        groups={staticGroups}
        onSearch={searchEverything}
        onSelect={(item) => {
          if (/^https?:/.test(item.href)) window.open(item.href, "_blank", "noopener");
          else router.push(item.href);
        }}
      />
    </>
  );
}
