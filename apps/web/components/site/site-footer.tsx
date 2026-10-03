import { Footer, Logo, ThemeToggle, type FooterColumn } from "@retexia/ui";
import { cacheLife, cacheTag } from "next/cache";
import { CONTENT_TAG, getNavigation, getProducts, getSiteSettings, productHref } from "@/lib/content";
import { getT } from "@/lib/strings.server";

const SOCIAL_NAMES: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  twitter: "X",
};

export async function SiteFooter() {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife({ stale: 300, revalidate: 60, expire: 86400 });

  const [settings, navigation, products, t] = await Promise.all([
    getSiteSettings(),
    getNavigation(),
    getProducts(),
    getT(),
  ]);

  const column = (location: string, title: string): FooterColumn => ({
    title,
    links: navigation
      .filter((n) => n.location === location)
      .flatMap((n) =>
        n.kind === "products_menu"
          ? products.map((p) => ({ label: p.name, href: productHref(p) }))
          : n.href
            ? [{ label: n.label, href: n.href, newTab: n.open_in_new_tab }]
            : [],
      ),
  });

  const social = Array.isArray(settings.social_links)
    ? (settings.social_links as { platform?: string; url?: string }[]).filter(
        (s) => typeof s?.url === "string" && /^https:\/\//.test(s.url),
      )
    : [];

  const year = new Date().getFullYear();
  const copyright = (settings.copyright_text ?? `© {year} ${settings.site_name}`).replace("{year}", String(year));

  return (
    <Footer
      label={t("footer.label", "Footer")}
      brand={<Logo name={settings.site_name} src={settings.logo_url} darkSrc={settings.logo_dark_url} />}
      text={settings.footer_text ?? settings.tagline}
      columns={[
        column("footer_products", t("footer.products", "Products")),
        column("footer_company", t("footer.company", "Company")),
        column("footer_legal", t("footer.legal", "Legal")),
      ]}
      bottom={copyright}
      aside={
        <>
          {social.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-full px-2 type-label text-ink-muted transition-hover hover:text-ink focus-visible:focus-ring"
            >
              {SOCIAL_NAMES[(s.platform ?? "").toLowerCase()] ?? s.platform ?? s.url}
            </a>
          ))}
          <ThemeToggle
            labels={{
              light: t("theme.light", "Light theme"),
              dark: t("theme.dark", "Dark theme"),
              system: t("theme.system", "System theme"),
              switchTo: t("theme.switch", "Switch theme"),
            }}
          />
        </>
      }
    />
  );
}
