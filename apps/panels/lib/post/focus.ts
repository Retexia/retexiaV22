/**
 * What a post is about (posts.brief.focus): one product, a group of products,
 * or the whole business ("About your business"). Shared by the server and the
 * dialogs; in a <select> it is "business", "product:<id>" or "group:<id>".
 */
export type Focus = { type: "business" } | { type: "product" | "group"; id: string; name: string };
export type FocusChoices = { products: { id: string; name: string }[]; groups: { id: string; name: string; count: number }[] };

export const BUSINESS_FOCUS: Focus = { type: "business" };

export function focusValue(f: Focus | null | undefined): string {
  return f && f.type !== "business" ? `${f.type}:${f.id}` : "business";
}

/** The focus saved on a post (older posts have none: the whole business). */
export function readFocus(brief: unknown): Focus {
  const f = (brief as { focus?: Partial<Focus> & { id?: string; name?: string } } | null)?.focus;
  if (f && (f.type === "product" || f.type === "group") && typeof f.id === "string") return { type: f.type, id: f.id, name: f.name ?? "" };
  return BUSINESS_FOCUS;
}

export function focusLabel(f: Focus): string {
  if (f.type === "product") return f.name || "One product";
  if (f.type === "group") return `${f.name || "A group"} (group)`;
  return "The whole business";
}

/** Options for the "About" drop-down. */
export function focusOptions(c: FocusChoices) {
  return [
    { value: "business", label: "The whole business (About your business)" },
    ...c.groups.map((g) => ({ value: `group:${g.id}`, label: `Group · ${g.name} (${g.count} product${g.count === 1 ? "" : "s"})` })),
    ...c.products.map((p) => ({ value: `product:${p.id}`, label: `Product · ${p.name}` })),
  ];
}

/** A drop-down value back to a focus, checked against the business's own products and groups. */
export function parseFocus(value: string | undefined, c: FocusChoices): Focus {
  const [type, id] = (value ?? "business").split(":");
  if (type === "product") {
    const p = c.products.find((x) => x.id === id);
    if (p) return { type: "product", id: p.id, name: p.name };
  }
  if (type === "group") {
    const g = c.groups.find((x) => x.id === id);
    if (g) return { type: "group", id: g.id, name: g.name };
  }
  return BUSINESS_FOCUS;
}

/**
 * settings.topic_mix: what the daily playlist's items are about. share = the
 * part about one product (the rest is about the whole business). Products take
 * turns in a queue (the one featured longest ago goes next), so none is missed.
 */
export type TopicMix = "balanced" | "products_only" | "mostly_products" | "mostly_business" | "business_only";
export const TOPIC_MIXES: { value: TopicMix; label: string; description: string; share: number }[] = [
  { value: "balanced", label: "A mix", description: "About 7 in 10 about a product, the rest about the whole business.", share: 0.7 },
  { value: "mostly_products", label: "Mostly products", description: "About 9 in 10 about a product.", share: 0.9 },
  { value: "products_only", label: "Only products", description: "Every item is about one product, each one in turn.", share: 1 },
  { value: "mostly_business", label: "Mostly the whole business", description: "About 9 in 10 about the business; products now and then.", share: 0.1 },
  { value: "business_only", label: "Only the whole business", description: "What you do and why people choose you; no single product.", share: 0 },
];
export const isTopicMix = (v: unknown): v is TopicMix => TOPIC_MIXES.some((m) => m.value === v);
