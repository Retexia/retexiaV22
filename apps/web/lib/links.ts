import type { SiteSettings } from "./content";

/** wa.me link for the site's WhatsApp number, with an optional prefilled message. */
export function whatsappHref(settings: Pick<SiteSettings, "whatsapp_number" | "whatsapp_default_message">, message?: string) {
  const digits = (settings.whatsapp_number ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const text = message ?? settings.whatsapp_default_message ?? "";
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/**
 * Resolve hrefs stored in the database. Special values:
 *   "whatsapp:"            → wa.me link with the default message
 *   "whatsapp:Hi there"    → wa.me link with that message
 *   "mailto:" (empty)      → the site contact email
 */
export function resolveHref(href: string, settings: SiteSettings): string | null {
  const value = href.trim();
  if (/^whatsapp:/i.test(value)) {
    const message = value.slice("whatsapp:".length).trim();
    return whatsappHref(settings, message || undefined);
  }
  if (value === "mailto:") return settings.contact_email ? `mailto:${settings.contact_email}` : null;
  if (/^javascript:/i.test(value)) return null;
  return value;
}

export function telHref(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}
