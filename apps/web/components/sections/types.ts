import type { SectionHeaderProps } from "@retexia/ui";
import type { Page, PageSection, Product, SiteSettings } from "@/lib/content";
import type { SectionContent, SectionType } from "@/lib/sections/schemas";
import type { Translate } from "@/lib/strings";

export type RenderContext = {
  settings: SiteSettings;
  page: Page;
  /** The product this page belongs to (pages.product_id), if any. */
  product: Product | null;
  t: Translate;
};

export type SectionProps<T extends SectionType> = {
  section: PageSection;
  content: SectionContent<T>;
  ctx: RenderContext;
  /** The first section carries the page's only <h1>. */
  isFirst: boolean;
};

export function headerProps(section: PageSection, isFirst: boolean, size: SectionHeaderProps["size"] = "h1"): SectionHeaderProps {
  return {
    eyebrow: section.eyebrow,
    title: section.title,
    highlight: section.highlight,
    subtitle: section.subtitle,
    as: isFirst ? "h1" : "h2",
    size: isFirst && size === "h1" ? "display" : size,
  };
}
