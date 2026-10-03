"use client";

import { cn } from "@retexia/ui";
import { createBrowserClient } from "@retexia/supabase/browser";
import { Compass, LayoutGrid, LogOut, Package, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/lib/strings-context";

/** Live version: highlights the current page (wrap in Suspense). */
export function AccountNavLive() {
  return <AccountNav pathname={usePathname() ?? ""} />;
}

export function AccountNav({ pathname }: { pathname: string }) {
  const t = useT();
  const router = useRouter();
  const items = [
    { href: "/account", label: t("account.nav.overview", "Overview"), icon: LayoutGrid, exact: true },
    { href: "/account/products", label: t("account.nav.products", "My products"), icon: Package },
    { href: "/account/profile", label: t("account.nav.profile", "Profile"), icon: UserRound },
    { href: "/account/security", label: t("account.nav.security", "Security"), icon: ShieldCheck },
  ];
  const itemClass = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 type-label transition-hover focus-visible:focus-ring",
      active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface hover:text-ink",
    );

  return (
    <nav aria-label={t("account.nav.label", "Account")} className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={itemClass(active)} aria-current={active ? "page" : undefined}>
            <Icon aria-hidden size={18} strokeWidth={1.5} />
            {label}
          </Link>
        );
      })}
      <div aria-hidden className="mx-2 hidden h-px bg-line md:my-2 md:block" />
      <Link href="/products" className={itemClass(false)}>
        <Compass aria-hidden size={18} strokeWidth={1.5} />
        {t("account.nav.browse", "Browse products")}
      </Link>
      <button
        type="button"
        className={itemClass(false)}
        onClick={async () => {
          await createBrowserClient().auth.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        <LogOut aria-hidden size={18} strokeWidth={1.5} />
        {t("nav.sign_out", "Sign out")}
      </button>
    </nav>
  );
}
