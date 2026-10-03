import "./globals.css";

import { ThemeStyle } from "@retexia/ui/theme-style";
import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Noto_Sans_Sinhala, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { getProducts, getSiteSettings, getStrings } from "@/lib/content";
import { siteUrl } from "@/lib/site-url";

const outfit = Outfit({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-outfit", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-dm-sans", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-dm-mono", display: "swap" });
const sinhala = Noto_Sans_Sinhala({
  subsets: ["sinhala"],
  weight: ["400", "500"],
  variable: "--font-sinhala",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const template = settings.seo_title_template.includes("%s") ? settings.seo_title_template : `%s · ${settings.site_name}`;
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: settings.seo_default_title ?? settings.site_name, template },
    description: settings.seo_default_description ?? settings.tagline ?? undefined,
    applicationName: settings.site_name,
    icons: settings.favicon_url ? { icon: settings.favicon_url } : undefined,
    openGraph: {
      type: "website",
      siteName: settings.site_name,
      locale: "en_LK",
      ...(settings.og_image_url ? { images: [{ url: settings.og_image_url }] } : {}),
    },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1322" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [settings, products, strings] = await Promise.all([getSiteSettings(), getProducts(), getStrings()]);
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${dmSans.variable} ${dmMono.variable} ${sinhala.variable}`}
    >
      <head>
        <ThemeStyle overrides={settings.theme} products={products} />
      </head>
      <body className="min-h-dvh bg-surface text-ink antialiased">
        <Providers defaultTheme={settings.default_theme} strings={strings}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
