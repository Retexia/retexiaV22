"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { DropdownMenu, ThemeToggle } from "@retexia/ui";
import { PanelShell, type PanelNavGroup } from "@retexia/ui/admin";
import { FileSpreadsheet, FileStack, LayoutDashboard, LogOut, Package, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { toolFor } from "@/lib/feeder/tools";

const icon = (C: typeof LayoutDashboard) => <C aria-hidden size={18} strokeWidth={1.5} />;
const TOOL_ICON = { "bulk-import": FileSpreadsheet, "bulk-import-v2": FileStack } as const;

/** Every Feeder package in the menu; packages not bought are greyed out with a lock. */
export function FeederShell({ children, packages, webUrl, email }: { children: ReactNode; packages: { slug: string; name: string; owned: boolean }[]; webUrl: string; email: string }) {
  const groups: PanelNavGroup[] = [
    { items: [{ href: "/", label: "Overview", icon: icon(LayoutDashboard), exact: true }] },
    {
      label: "Packages",
      items: packages.map((p) => {
        const tool = toolFor(p.slug);
        return { href: `/${p.slug}`, label: p.name, icon: icon(tool ? TOOL_ICON[tool] : Package), locked: !p.owned };
      }),
    },
  ];
  return (
    <PanelShell
      brand={
        <span className="flex items-center gap-2">
          <span className="font-display text-[20px] text-brand">Retexia</span>
          <span className="rounded-sm px-1.5 py-0.5 type-caption" style={{ color: "var(--product-feeder, var(--rx-brand))", background: "var(--product-feeder-soft, var(--rx-brand-soft))" }}>
            Feeder
          </span>
        </span>
      }
      groups={groups}
      topbar={
        <>
          <span className="ml-auto" />
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
