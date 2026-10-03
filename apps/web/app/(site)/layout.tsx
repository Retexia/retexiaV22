import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/site/announcement";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getT } from "@/lib/strings.server";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-brand px-4 py-2 type-label text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("nav.skip", "Skip to content")}
      </a>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
