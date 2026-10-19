import "server-only";

import { createServerClient } from "@retexia/supabase/server";

/** The order form's "Industry" answers → the panel's business types. */
const INDUSTRY: Record<string, string> = {
  clothing: "Clothing and fashion",
  food: "Restaurant or café",
  electronics: "Electronics and phones",
  beauty: "Beauty and salon",
  health: "Health and wellness",
  education: "Education and classes",
  travel: "Travel and hotels",
  real_estate: "Real estate",
  hardware: "Other",
  other: "Other",
};

export type OrderContact = { phone?: string; whatsapp?: string; instagram?: string; website?: string; address?: string };
export type OrderPrefill = {
  name: string;
  category: string;
  languages: ("en" | "si" | "ta")[];
  whatsapp: string | null;
  city: string | null;
  /** Everything else they wrote, as an editable "About your business" text. */
  brief: string;
  contact: OrderContact;
};

type Answer = { key?: string; label?: string; value?: unknown; display_value?: unknown; step?: string };

/** Answers that are not about the business itself (or are used elsewhere). */
const SKIP = /^(business_name|languages|agree|terms|consent|contact_name|full_name|name|email|password)$|agree|consent/i;
const DESCRIPTION = /description|about|brief|summary|what_.*(sell|do)|products?_info/i;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : typeof v === "number" ? String(v) : "");

/**
 * What the customer told us on the Retexia Post order form, so the panel
 * doesn't ask again: name, industry, languages, contact details, and every
 * other answer (description, goals, notes, anything added to the form later)
 * as an "About your business" text they can edit on the Brand page.
 * Read with the customer's own session (RLS: their own order only).
 */
export async function orderPrefill(orderId: string): Promise<OrderPrefill | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("orders").select("answers").eq("id", orderId).maybeSingle();
  const answers = (Array.isArray(data?.answers) ? data.answers : []) as Answer[];
  const get = (key: string) => answers.find((a) => a?.key === key)?.value;
  const name = text(get("business_name")).slice(0, 120);
  if (!name) return null;

  const langs = (Array.isArray(get("languages")) ? (get("languages") as unknown[]) : []).filter((l): l is "en" | "si" | "ta" => l === "en" || l === "si" || l === "ta");
  const category = INDUSTRY[text(get("industry"))] ?? "";
  const contact: OrderContact = {};
  const descriptions: string[] = [];
  const facts: string[] = [];
  let city: string | null = null;

  for (const a of answers) {
    const key = String(a?.key ?? "");
    const shown = text(a?.display_value) || text(a?.value);
    if (!key || !shown || SKIP.test(key) || shown === "true" || shown === "false" || shown === "[removed]") continue;
    if (/phone|whatsapp/i.test(key)) {
      const digits = shown.replace(/[^\d+]/g, "");
      if (/^\+?\d{8,15}$/.test(digits)) {
        contact.phone ??= digits;
        contact.whatsapp ??= digits;
      }
      continue;
    }
    if (/instagram/i.test(key)) {
      contact.instagram ??= shown.startsWith("@") ? shown : `@${shown.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "")}`;
      continue;
    }
    if (/facebook/i.test(key)) continue; // connected with Facebook later
    if (/website|url|site/i.test(key) && /^https?:\/\//i.test(shown)) {
      contact.website ??= shown;
      continue;
    }
    if (/^(city|town|location|address|area)$/i.test(key) || /address/i.test(key)) {
      if (/^(city|town)$/i.test(key)) city = shown.slice(0, 80);
      contact.address ??= shown.slice(0, 200);
      continue;
    }
    if (key === "industry") continue; // the business type
    if (DESCRIPTION.test(key)) descriptions.push(shown);
    else facts.push(`${String(a?.label ?? key).replace(/\?$/, "")}: ${shown}`);
  }

  const intro = `${name}${category ? ` is a ${category.toLowerCase()} business` : ""}${city ? ` in ${city}` : ""}.`;
  const brief = [intro, ...descriptions, facts.length ? facts.join("\n") : ""].filter(Boolean).join("\n\n").slice(0, 3000);
  const phone = contact.whatsapp ?? null;
  return { name, category, languages: langs.length ? langs : ["en"], whatsapp: phone, city, brief, contact };
}
