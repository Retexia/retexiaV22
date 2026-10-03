import { Logo, NavBar, Skeleton, ThemeToggle, type NavItem } from "@retexia/ui";
import { Icon } from "@retexia/ui/icon";
import { Suspense } from "react";
import { getNavigation, getProducts, getSiteSettings, productHref } from "@/lib/content";
import { getT } from "@/lib/strings.server";
import { MobileUserLinks, UserMenu } from "./user-menu";

export async function SiteHeader() {
  const [settings, navigation, products, t] = await Promise.all([
    getSiteSettings(),
    getNavigation(),
    getProducts(),
    getT(),
  ]);

  const navProducts = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    href: productHref(p),
    statusLabel: p.status === "coming_soon" ? t("product.status.coming_soon", "Coming soon") : null,
    icon: <Icon name={p.icon} fallback="box" size={18} />,
  }));

  const items: NavItem[] = navigation
    .filter((n) => n.location === "header")
    .flatMap((n): NavItem[] => {
      if (n.kind === "products_menu") {
        return navProducts.length
          ? [{ kind: "products_menu", label: n.label, products: navProducts, allHref: "/products", allLabel: t("nav.all_products", "All products") }]
          : [];
      }
      if (!n.href) return [];
      return [{ kind: n.kind === "button" ? "button" : "link", label: n.label, href: n.href, newTab: n.open_in_new_tab }];
    });

  return (
    <NavBar
      brand={
        <Logo
          name={settings.site_name}
          src={settings.logo_url}
          darkSrc={settings.logo_dark_url}
          homeLabel={t("nav.home", "{site} home", { site: settings.site_name })}
        />
      }
      items={items}
      labels={{
        openMenu: t("nav.open_menu", "Open menu"),
        closeMenu: t("nav.close_menu", "Close menu"),
        main: t("nav.main", "Main"),
      }}
      actions={
        <>
          <ThemeToggle
            labels={{
              light: t("theme.light", "Light theme"),
              dark: t("theme.dark", "Dark theme"),
              system: t("theme.system", "System theme"),
              switchTo: t("theme.switch", "Switch theme"),
            }}
          />
          <Suspense fallback={<Skeleton className="size-9 rounded-full" />}>
            <UserMenu />
          </Suspense>
        </>
      }
      mobileActions={
        <>
          <MobileUserLinks />
          <div className="flex justify-center pt-2">
            <ThemeToggle
              labels={{
                light: t("theme.light", "Light theme"),
                dark: t("theme.dark", "Dark theme"),
                system: t("theme.system", "System theme"),
                switchTo: t("theme.switch", "Switch theme"),
              }}
            />
          </div>
        </>
      }
    />
  );
}
