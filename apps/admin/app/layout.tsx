import "./globals.css";

import { createServerClient } from "@retexia/supabase/server";
import { ThemeStyle } from "@retexia/ui/theme-style";
import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Noto_Sans_Sinhala, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";

const outfit = Outfit({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-outfit", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-dm-sans", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-dm-mono", display: "swap" });
const sinhala = Noto_Sans_Sinhala({ subsets: ["sinhala"], weight: ["400", "500"], variable: "--font-sinhala", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Retexia admin", template: "%s · Retexia admin" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1322" },
  ],
};

async function productColors() {
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.from("products").select("slug, color_light, color_dark, color_soft_light, color_soft_dark");
    return data ?? [];
  } catch {
    return [];
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The admin keeps the design-system defaults (not the website theme overrides),
  // plus every product's colour for chips and dots.
  const products = await productColors();
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${dmSans.variable} ${dmMono.variable} ${sinhala.variable}`}>
      <head>
        <ThemeStyle overrides={{}} products={products} />
      </head>
      <body className="min-h-dvh bg-surface text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
