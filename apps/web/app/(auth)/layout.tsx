import { Logo, ThemeToggle } from "@retexia/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSiteSettings } from "@/lib/content";
import { getT } from "@/lib/strings.server";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const [settings, t] = await Promise.all([getSiteSettings(), getT()]);
  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunk">
      <header className="mx-auto flex h-16 w-full max-w-[calc(var(--rx-container)_+_2_*_var(--rx-gutter))] items-center justify-between gap-4 px-gutter md:h-[72px]">
        <Logo
          name={settings.site_name}
          src={settings.logo_url}
          darkSrc={settings.logo_dark_url}
          homeLabel={t("nav.home", "{site} home", { site: settings.site_name })}
        />
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 type-label text-ink-muted transition-hover hover:text-ink focus-visible:focus-ring"
          >
            <ArrowLeft aria-hidden size={16} strokeWidth={1.5} />
            {t("auth.back_to_site", "Back to site")}
          </Link>
          <ThemeToggle
            labels={{
              light: t("theme.light", "Light theme"),
              dark: t("theme.dark", "Dark theme"),
              system: t("theme.system", "System theme"),
              switchTo: t("theme.switch", "Switch theme"),
            }}
          />
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-gutter pt-6 pb-16 md:items-center md:pt-0">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
    </div>
  );
}
