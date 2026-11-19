"use client";

import { LinkTabs } from "@retexia/ui/admin";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/autopublish", label: "Launch", exact: true },
  { href: "/autopublish/launches", label: "Launches" },
  { href: "/autopublish/templates", label: "Templates" },
  { href: "/autopublish/accounts", label: "Accounts" },
];

/** Autopublish's own tabs (the URL is feeder.retexia.com/autopublish/…). */
export function AutopublishNav({ attention }: { attention: number }) {
  const path = usePathname().replace(/^\/feeder/, "");
  return (
    <LinkTabs
      label="Autopublish"
      items={TABS.map((t) => ({
        href: t.href,
        label: t.label,
        active: t.exact ? path === t.href : path.startsWith(t.href),
        count: t.href === "/autopublish/launches" && attention ? attention : null,
      }))}
    />
  );
}
