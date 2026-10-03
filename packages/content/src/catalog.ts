import type { SectionContent, SectionType } from "./schemas";

/**
 * Human labels and starting content for every section type. The admin's
 * "Add section" gallery and the product wizard use these; the website only
 * uses the schemas.
 */
export type SectionInfo<T extends SectionType = SectionType> = {
  label: string;
  description: string;
  /** Lucide icon name for the gallery. */
  icon: string;
  /** Common columns for a fresh section. */
  defaults: { eyebrow?: string; title?: string; highlight?: string; subtitle?: string; background?: "surface" | "sunk"; anchor?: string };
  content: SectionContent<T>;
};

export const sectionCatalog: { [K in SectionType]: SectionInfo<K> } = {
  hero: {
    label: "Hero",
    description: "The big opening: headline, intro, buttons and an optional visual.",
    icon: "panel-top",
    defaults: { eyebrow: "Product name", title: "A headline about what they get", highlight: "what they get", subtitle: "One or two sentences that explain the benefit in plain words." },
    content: {
      primary_cta: { label: "See plans", href: "#pricing" },
      secondary_cta: { label: "Talk to us", href: "/contact" },
      visual: "none",
      show_halo: true,
      size: "large",
    },
  },
  features: {
    label: "Features",
    description: "Three columns of benefits with icons, from the product or written here.",
    icon: "layout-grid",
    defaults: { eyebrow: "What you get", title: "Everything you need, nothing you do not", highlight: "nothing you do not", anchor: "features" },
    content: { source: "product", columns: 3 },
  },
  products: {
    label: "Products",
    description: "Cards for every visible product.",
    icon: "boxes",
    defaults: { eyebrow: "Products", title: "Ready-made tools, set up for you", highlight: "set up for you" },
    content: { include_coming_soon: true, show_status: true },
  },
  services: {
    label: "Services",
    description: "The custom services list.",
    icon: "briefcase",
    defaults: { eyebrow: "Services", title: "Need something made just for you?", highlight: "just for you", background: "sunk", anchor: "services" },
    content: { layout: "grid" },
  },
  steps: {
    label: "Steps",
    description: "How it works, in numbered steps.",
    icon: "list-ordered",
    defaults: { eyebrow: "Setup", title: "Live in three simple steps", highlight: "three simple steps", background: "sunk", anchor: "setup" },
    content: {
      items: [
        { icon: "clipboard-list", title: "Tell us about you", text: "A short form, about ten minutes." },
        { icon: "wrench", title: "We set it up", text: "We build and test it for you." },
        { icon: "circle-check", title: "Switch on", text: "It runs. You relax." },
      ],
    },
  },
  about: {
    label: "About",
    description: "A short story with honest stats.",
    icon: "info",
    defaults: { eyebrow: "About us", title: "A team that hates busywork", highlight: "hates busywork", background: "sunk", anchor: "about" },
    content: { body: "Write a short paragraph about who you are.", stats: [] },
  },
  pricing: {
    label: "Pricing",
    description: "The product's packages with a monthly / yearly switch.",
    icon: "tags",
    defaults: { eyebrow: "Pricing", title: "Simple plans, no surprises", highlight: "no surprises", anchor: "pricing", subtitle: "Every plan includes setup by our team." },
    content: { show_yearly_toggle: true },
  },
  faq: {
    label: "FAQ",
    description: "Questions and answers (general or for one product).",
    icon: "circle-help",
    defaults: { eyebrow: "Questions", title: "Good to know", highlight: "know", background: "sunk", anchor: "faq" },
    content: {},
  },
  testimonials: {
    label: "Testimonials",
    description: "Real customer quotes. Hidden while there are none.",
    icon: "quote",
    defaults: { eyebrow: "Customers", title: "What business owners say", highlight: "say" },
    content: {},
  },
  cta: {
    label: "Call to action",
    description: "A closing line with one or two buttons.",
    icon: "megaphone",
    defaults: { title: "Ready when you are", highlight: "you are", subtitle: "Pick a plan and we will be in touch within one working day." },
    content: { primary_cta: { label: "Choose a plan", href: "#pricing" }, secondary_cta: { label: "Talk to us", href: "/contact" } },
  },
  contact: {
    label: "Contact",
    description: "Contact form with email, phone, WhatsApp and hours.",
    icon: "mail",
    defaults: { eyebrow: "Contact", title: "Talk to a real person", highlight: "real person", anchor: "contact" },
    content: { show_form: true, show_details: true, show_whatsapp: true },
  },
  waitlist: {
    label: "Waitlist",
    description: "Email sign-up for a coming soon product.",
    icon: "list-plus",
    defaults: { eyebrow: "Waitlist", title: "Be the first to try it", highlight: "first", background: "sunk", anchor: "waitlist", subtitle: "Leave your email. We will write once, when it opens." },
    content: {},
  },
  rich_text: {
    label: "Text",
    description: "Long text with headings, lists and links (markdown).",
    icon: "text",
    defaults: { title: "Page title" },
    content: { body: "## A heading\n\nWrite your text here." },
  },
  image_text: {
    label: "Image and text",
    description: "An image next to text, with an optional button.",
    icon: "image",
    defaults: { title: "A short headline" },
    content: { body: "A few sentences.", image_url: "https://", image_alt: "", image_side: "right" },
  },
};

export const sectionTypes = Object.keys(sectionCatalog) as SectionType[];

/** Default sections for a new product page, in order. */
export function productPageSections(productName: string, productSlug: string, hasPackages: boolean) {
  const types: SectionType[] = ["hero", "features", "steps", hasPackages ? "pricing" : "waitlist", "faq", "cta"];
  return types.map((type, i) => {
    const info = sectionCatalog[type];
    const content: Record<string, unknown> = { ...(info.content as Record<string, unknown>) };
    if (type === "pricing" || type === "faq" || type === "waitlist") content.product_slug = productSlug;
    if (type === "hero" && !hasPackages) {
      content.badge = "Coming soon";
      content.primary_cta = { label: "Join the waitlist", href: "#waitlist" };
    }
    return {
      type,
      sort_order: i + 1,
      background: info.defaults.background ?? "surface",
      anchor: info.defaults.anchor ?? null,
      eyebrow: type === "hero" ? productName : (info.defaults.eyebrow ?? null),
      title: info.defaults.title ?? null,
      highlight: info.defaults.highlight ?? null,
      subtitle: info.defaults.subtitle ?? null,
      content,
    };
  });
}
