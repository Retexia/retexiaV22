"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { DropdownMenu, ThemeToggle } from "@retexia/ui";
import { PanelShell, type PanelNavGroup } from "@retexia/ui/admin";
import { CalendarCheck, Flame, LayoutDashboard, LogOut, Settings, Target, UserRound } from "lucide-react";
import type { ReactNode } from "react";

const icon = (C: typeof LayoutDashboard) => <C aria-hidden size={18} strokeWidth={1.5} />;

export function PlanShell({ children, webUrl, email, streak, todayLeft }: { children: ReactNode; webUrl: string; email: string; streak: number; todayLeft: number }) {
  const groups: PanelNavGroup[] = [
    {
      items: [
        { href: "/", label: "Today", icon: icon(CalendarCheck), exact: true, badge: todayLeft || null },
        { href: "/overview", label: "Overview", icon: icon(LayoutDashboard) },
        { href: "/goals", label: "Goals", icon: icon(Target) },
      ],
    },
    { items: [{ href: "/settings", label: "Reminders and settings", icon: icon(Settings) }] },
  ];
  return (
    <PanelShell
      brand={
        <span className="flex items-center gap-2">
          <span className="font-display text-[20px] text-brand">Retexia</span>
          <span className="rounded-sm px-1.5 py-0.5 type-caption" style={{ color: "var(--product-plan, var(--rx-brand))", background: "var(--product-plan-soft, var(--rx-brand-soft))" }}>
            Plan
          </span>
        </span>
      }
      groups={groups}
      topbar={
        <>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunk px-3 py-1 type-label text-ink"
            title={streak ? `${streak} day${streak === 1 ? "" : "s"} in a row with every task done` : "Finish all of today's tasks to start a streak"}
          >
            <Flame aria-hidden size={16} strokeWidth={1.5} className={streak ? "text-warning" : "text-ink-muted"} />
            {streak}
            <span className="sr-only"> day streak</span>
          </span>
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
