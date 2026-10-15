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

export type OrderPrefill = { name: string; category: string; languages: ("en" | "si" | "ta")[]; whatsapp: string | null; city: string | null };

/**
 * What the customer already told us on the Retexia Post order form (business
 * name, industry, languages, WhatsApp), so the panel doesn't ask again.
 * Read with the customer's own session (RLS: their own order only).
 */
export async function orderPrefill(orderId: string): Promise<OrderPrefill | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("orders").select("answers").eq("id", orderId).maybeSingle();
  const answers = (Array.isArray(data?.answers) ? data.answers : []) as { key?: string; value?: unknown }[];
  const get = (key: string) => answers.find((a) => a?.key === key)?.value;
  const name = typeof get("business_name") === "string" ? String(get("business_name")).trim() : "";
  if (!name) return null;
  const langs = (Array.isArray(get("languages")) ? (get("languages") as unknown[]) : []).filter((l): l is "en" | "si" | "ta" => l === "en" || l === "si" || l === "ta");
  const phone = typeof get("contact_phone") === "string" ? String(get("contact_phone")).replace(/[^\d+]/g, "") : "";
  return {
    name: name.slice(0, 120),
    category: INDUSTRY[String(get("industry") ?? "")] ?? "",
    languages: langs.length ? langs : ["en"],
    whatsapp: /^\+?\d{8,15}$/.test(phone) ? phone : null,
    city: typeof get("city") === "string" ? String(get("city")).trim().slice(0, 80) || null : null,
  };
}
