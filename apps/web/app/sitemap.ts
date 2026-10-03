import type { MetadataRoute } from "next";
import { getPublishedPages } from "@/lib/content";
import { siteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await getPublishedPages();
  const base = siteUrl();
  const entries = pages
    .filter((p) => p.show_in_sitemap)
    .map((p) => ({
      url: p.slug ? `${base}/${p.slug}` : base,
      lastModified: new Date(p.updated_at),
      changeFrequency: "weekly" as const,
      priority: p.slug === "" ? 1 : 0.7,
    }));
  return entries.length ? entries : [{ url: base, priority: 1 }];
}
