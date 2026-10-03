import { z } from "zod";

/**
 * page_sections.content schema per section type. Invalid content hides the
 * section (with a warning in the server log) instead of breaking the page.
 * Documented with examples in docs/EDITING_CONTENT.md.
 */

const text = z.string().trim().min(1);
const cta = z.object({ label: text, href: text });

const chatMessage = z.object({
  from: z.enum(["customer", "business"]),
  text: text,
  time: z.string().optional(),
});

export const sectionSchemas = {
  hero: z.object({
    primary_cta: cta.optional(),
    secondary_cta: cta.optional(),
    visual: z.enum(["lingo_chat", "chat", "image", "none"]).default("none"),
    image_url: z.string().optional(),
    image_alt: z.string().optional(),
    show_halo: z.boolean().default(true),
    badge: z.string().optional(),
    size: z.enum(["large", "small"]).default("large"),
    chat: z
      .object({
        name: z.string().optional(),
        status: z.string().optional(),
        messages: z.array(chatMessage).min(1).max(12),
      })
      .optional(),
  }),
  features: z.object({
    source: z.enum(["product", "inline"]).default("inline"),
    product_slug: z.string().optional(),
    items: z.array(z.object({ icon: z.string().optional(), title: text, text: z.string().optional() })).optional(),
    columns: z.union([z.literal(2), z.literal(3)]).default(3),
  }),
  products: z.object({
    include_coming_soon: z.boolean().default(true),
    show_status: z.boolean().default(true),
  }),
  services: z.object({ layout: z.enum(["grid"]).default("grid") }),
  steps: z.object({
    items: z.array(z.object({ title: text, text: z.string().optional(), icon: z.string().optional() })).min(1),
  }),
  about: z.object({
    body: z.string().default(""),
    stats: z.array(z.object({ value: text, label: text })).default([]),
    image_url: z.string().optional(),
    image_alt: z.string().optional(),
  }),
  pricing: z.object({
    product_slug: z.string().optional(),
    show_yearly_toggle: z.boolean().default(true),
    note: z.string().optional(),
  }),
  faq: z.object({ product_slug: z.string().optional() }),
  testimonials: z.object({ product_slug: z.string().optional() }),
  cta: z.object({ primary_cta: cta.optional(), secondary_cta: cta.optional() }),
  contact: z.object({
    show_form: z.boolean().default(true),
    show_details: z.boolean().default(true),
    show_whatsapp: z.boolean().default(true),
  }),
  waitlist: z.object({ product_slug: z.string().optional() }),
  rich_text: z.object({ body: text }),
  image_text: z.object({
    body: z.string().default(""),
    image_url: text,
    image_alt: z.string().default(""),
    image_side: z.enum(["left", "right"]).default("right"),
    cta: cta.optional(),
  }),
} as const;

export type SectionType = keyof typeof sectionSchemas;
export type SectionContent<T extends SectionType> = z.infer<(typeof sectionSchemas)[T]>;

export function isSectionType(type: string): type is SectionType {
  return type in sectionSchemas;
}
