"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { Button, DropdownMenu, ThemeToggle } from "@retexia/ui";
import { PanelShell, type PanelNavGroup } from "@retexia/ui/admin";
import { Activity, CalendarDays, CalendarRange, Image as ImageIcon, LayoutDashboard, LogOut, Package, Palette, Plus, Settings, Share2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { selectBusiness } from "@/app/actions";

const icon = (C: typeof LayoutDashboard) => <C aria-hidden size={18} strokeWidth={1.5} />;

export function PostShell({
  children,
  business,
  businesses,
  attention,
  usage,
  paused,
  webUrl,
  email,
}: {
  children: ReactNode;
  business: { id: string; name: string };
  businesses: { id: string; name: string }[];
  attention: number;
  usage: { used: number; limit: number };
  paused: boolean;
  webUrl: string;
  email: string;
}) {
  const router = useRouter();
  const groups: PanelNavGroup[] = [
    {
      items: [
        { href: "/", label: "Today", icon: icon(LayoutDashboard), exact: true, badge: attention || null },
        { href: "/calendar", label: "Calendar", icon: icon(CalendarDays) },
        { href: "/create", label: "New post", icon: icon(Plus) },
      ],
    },
    {
      label: "Your content",
      items: [
        { href: "/plan", label: "Week plan and offers", icon: icon(CalendarRange) },
        { href: "/library", label: "Photo library", icon: icon(ImageIcon) },
        { href: "/products", label: "Products", icon: icon(Package) },
        { href: "/brand", label: "Brand", icon: icon(Palette) },
      ],
    },
    {
      label: "Setup",
      items: [
        { href: "/accounts", label: "Facebook and Instagram", icon: icon(Share2) },
        { href: "/settings", label: "Schedule and settings", icon: icon(Settings) },
        { href: "/activity", label: "Activity and usage", icon: icon(Activity) },
      ],
    },
  ];
  const pct = usage.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  return (
    <PanelShell
      brand={
        <span className="flex items-center gap-2">
          <span className="font-display text-[20px] text-brand">Retexia</span>
          <span className="rounded-sm px-1.5 py-0.5 type-caption" style={{ color: "var(--product-post, var(--rx-brand))", background: "var(--product-post-soft, var(--rx-brand-soft))" }}>
            Post
          </span>
        </span>
      }
      groups={groups}
      topbar={
        <>
          {businesses.length > 1 ? (
            <select
              aria-label="Business"
              value={business.id}
              onChange={async (e) => {
                const r = await selectBusiness({ id: e.target.value });
                if (!r.ok) toast.error(r.message);
                router.refresh();
              }}
              className="h-9 max-w-[200px] rounded-full border border-line-strong bg-surface-raised px-3 type-label text-ink focus-visible:focus-ring"
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="hidden truncate type-label text-ink sm:inline">{business.name}</span>
          )}
          {paused ? <span className="rounded-full bg-warning-soft px-3 py-1 type-caption text-warning">Publishing paused</span> : null}
          <span className="ml-auto hidden items-center gap-2 md:flex" title={`${usage.used} of ${usage.limit} AI designs this month`}>
            <span className="type-small text-ink-muted">AI designs</span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunk" aria-hidden>
              <span className={`block h-full rounded-full ${pct >= 80 ? "bg-warning" : "bg-brand"}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="type-small text-ink-muted">
              {usage.used}/{usage.limit}
            </span>
          </span>
          <Button href="/create" size="sm" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} className="max-md:ml-auto">
            New post
          </Button>
          <ThemeToggle />
          <DropdownMenu
            align="end"
            triggerLabel="Account menu"
            triggerClassName="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface-raised text-ink focus-visible:focus-ring"
            trigger={<UserRound aria-hidden size={16} strokeWidth={1.5} />}
            header={<span className="block truncate px-3 py-2 type-small text-ink-muted">{email}</span>}
            items={[
              { href: `${webUrl}/account`, label: "My Retexia account", icon: <UserRound aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 text-ink-muted" /> },
              {
                type: "button",
                label: "Sign out",
                icon: <LogOut aria-hidden size={16} strokeWidth={1.5} className="mt-0.5 text-ink-muted" />,
                onSelect: async () => {
                  await createBrowserClient().auth.signOut();
                  window.location.href = webUrl;
                },
              },
            ]}
          />
        </>
      }
    >
      {children}
    </PanelShell>
  );
}
