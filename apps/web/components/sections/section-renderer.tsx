import type { ComponentType } from "react";
import type { PageSection } from "@/lib/content";
import { isSectionType, sectionSchemas, type SectionType } from "@/lib/sections/schemas";
import {
  AboutSection,
  CtaSection,
  FaqSection,
  FeaturesSection,
  HeroSection,
  ImageTextSection,
  ProductsSection,
  RichTextSection,
  ServicesSection,
  StepsSection,
  TestimonialsSection,
} from "./content-sections";
import { ContactSection, PricingSection, WaitlistSection } from "./form-sections";
import type { RenderContext, SectionProps } from "./types";

const registry: { [K in SectionType]: ComponentType<SectionProps<K>> } = {
  hero: HeroSection,
  features: FeaturesSection,
  products: ProductsSection,
  services: ServicesSection,
  steps: StepsSection,
  about: AboutSection,
  pricing: PricingSection,
  faq: FaqSection,
  testimonials: TestimonialsSection,
  cta: CtaSection,
  contact: ContactSection,
  waitlist: WaitlistSection,
  rich_text: RichTextSection,
  image_text: ImageTextSection,
};

/**
 * Renders page_sections in order. Each type validates its `content` JSON with
 * zod; invalid or unknown sections are skipped with a warning, never crashing
 * the page.
 */
export function SectionRenderer({ sections, ctx }: { sections: PageSection[]; ctx: RenderContext }) {
  const valid = sections.flatMap((section) => {
    if (!section.is_visible) return [];
    if (!isSectionType(section.type)) {
      console.warn(`[sections] unknown type "${section.type}" on /${ctx.page.slug} (${section.id}); skipped`);
      return [];
    }
    const parsed = sectionSchemas[section.type].safeParse(section.content ?? {});
    if (!parsed.success) {
      console.warn(
        `[sections] invalid content for ${section.type} on /${ctx.page.slug} (${section.id}); skipped:`,
        parsed.error.issues.map((i) => `${i.path.join(".") || "content"}: ${i.message}`).join("; "),
      );
      return [];
    }
    return [{ section, type: section.type, content: parsed.data }];
  });

  return (
    <>
      {valid.map(({ section, type, content }, index) => {
        const Component = registry[type] as ComponentType<SectionProps<SectionType>>;
        return <Component key={section.id} section={section} content={content} ctx={ctx} isFirst={index === 0} />;
      })}
    </>
  );
}
