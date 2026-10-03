import { Logo } from "@retexia/ui";
import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/content";
import { getT } from "@/lib/strings.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("maintenance.title", "We'll be right back"), robots: { index: false } };
}

export default async function MaintenancePage() {
  const [settings, t] = await Promise.all([getSiteSettings(), getT()]);
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-surface px-gutter">
      <div className="flex max-w-content flex-col items-center gap-6 text-center">
        <Logo name={settings.site_name} src={settings.logo_url} darkSrc={settings.logo_dark_url} href={null} />
        <h1 className="type-display text-ink">{t("maintenance.title", "We'll be right back")}</h1>
        <p className="max-w-measure type-body-lg text-ink-muted">
          {settings.maintenance_message ?? t("maintenance.text", "We are making a few improvements. Please check back soon.")}
        </p>
        {settings.contact_email ? (
          <a href={`mailto:${settings.contact_email}`} className="type-label text-link hover:text-brand-hover">
            {settings.contact_email}
          </a>
        ) : null}
      </div>
    </main>
  );
}
