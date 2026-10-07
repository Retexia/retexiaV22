"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { DropdownMenu, Switch, ThemeToggle } from "@retexia/ui";
import { PanelShell, type PanelNavGroup } from "@retexia/ui/admin";
import { Bot, Building2, LayoutDashboard, LogOut, MessageSquareText, Package, ShoppingBag, Smartphone, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { setBotActive } from "@/app/lingo/actions";

const icon = (C: typeof LayoutDashboard) => <C aria-hidden size={18} strokeWidth={1.5} />;

export function LingoShell({ children, business, active, newOrders, webUrl, email }: { children: ReactNode; business: string; active: boolean; newOrders: number; webUrl: string; email: string }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  const groups: PanelNavGroup[] = [
    {
      items: [
        { href: "/", label: "Overview", icon: icon(LayoutDashboard), exact: true },
        { href: "/orders", label: "Orders", icon: icon(ShoppingBag), badge: newOrders || null },
        { href: "/customers", label: "Customers", icon: icon(Users) },
        { href: "/products", label: "Products", icon: icon(Package) },
      ],
    },
    {
      label: "Your bot",
      items: [
        { href: "/business", label: "Business details", icon: icon(Building2) },
        { href: "/replies", label: "Bot replies", icon: icon(MessageSquareText) },
        { href: "/settings", label: "Bot settings", icon: icon(Bot) },
        { href: "/connect", label: "WhatsApp", icon: icon(Smartphone) },
      ],
    },
  ];
  return (
    <PanelShell
      brand={
        <span className="flex items-center gap-2">
          <span className="font-display text-[20px] text-brand">Retexia</span>
          <span className="rounded-sm px-1.5 py-0.5 type-caption" style={{ color: "var(--product-lingo, var(--rx-brand))", background: "var(--product-lingo-soft, var(--rx-brand-soft))" }}>
            Lingo
          </span>
        </span>
      }
      groups={groups}
      topbar={
        <>
          <span className="hidden truncate type-label text-ink sm:inline">{business}</span>
          <span className="ml-auto flex items-center gap-2">
            <Switch
              checked={on}
              label={on ? "Lingo is answering" : "Lingo is paused"}
              onCheckedChange={async (v) => {
                if (!v && !window.confirm("Pause Lingo? Customers' WhatsApp messages won't be answered until you turn it back on.")) return;
                setOn(v);
                const r = await setBotActive({ active: v });
                toast[r.ok ? "success" : "error"](r.message ?? "");
                if (!r.ok) setOn(!v);
                router.refresh();
              }}
            />
          </span>
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
