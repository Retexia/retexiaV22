import "server-only";

import type { Tables } from "@retexia/supabase";
import { createStaticClient } from "@retexia/supabase/static";
import { cacheLife, cacheTag } from "next/cache";
import { parseForm, type FormDef } from "./forms/engine";

/**
 * Public content, read with the anonymous client (no cookies) and cached with
 * the "content" tag. POST /api/revalidate (called by a Supabase Database
 * Webhook) expires the tag, so edits in the table editor show up in seconds.
 * Without a webhook, content refreshes on its own every 60 seconds.
 */
export const CONTENT_TAG = "content";
const CONTENT_LIFE = { stale: 300, revalidate: 60, expire: 86400 };

function cache() {
  cacheTag(CONTENT_TAG);
  cacheLife(CONTENT_LIFE);
}

function logError(scope: string, error: { message: string } | null) {
  if (error) console.error(`[content] ${scope}: ${error.message}`);
}

export const RESERVED_SLUGS = new Set([
  "account",
  "login",
  "signup",
  "auth",
  "api",
  "forgot-password",
  "reset-password",
  "maintenance",
  "_styleguide",
  "styleguide",
]);

export type SiteSettings = Tables<"site_settings">;
export type Product = Tables<"products">;
export type Page = Tables<"pages">;
export type PageSection = Tables<"page_sections">;
export type NavigationItem = Tables<"navigation_items">;
export type Service = Tables<"services">;
export type Faq = Tables<"faqs">;
export type Testimonial = Tables<"testimonials">;
export type ProductFeature = Tables<"product_features">;
export type OrderStatus = Tables<"order_statuses">;
export type PackageWithFeatures = Tables<"packages"> & { features: Tables<"package_features">[] };

/** Used when Supabase is not configured or unreachable, so the site still renders. */
export const FALLBACK_SETTINGS: SiteSettings = {
  id: 1,
  site_name: "Retexia",
  tagline: "Simple tools that run your business busywork",
  logo_url: null,
  logo_dark_url: null,
  favicon_url: null,
  seo_title_template: "%s · Retexia",
  seo_default_title: "Retexia",
  seo_default_description: "Simple tools that run your business busywork.",
  og_image_url: null,
  contact_email: null,
  contact_phone: null,
  whatsapp_number: null,
  whatsapp_default_message: null,
  address: null,
  business_hours: null,
  social_links: [],
  footer_text: null,
  copyright_text: "© {year} Retexia",
  announcement_enabled: false,
  announcement_text: null,
  announcement_href: null,
  theme: {},
  default_theme: "system",
  currency_code: "LKR",
  currency_locale: "en-LK",
  auth_google_enabled: false,
  auth_magic_link_enabled: true,
  maintenance_mode: false,
  maintenance_message: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export async function getSiteSettings(): Promise<SiteSettings> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return FALLBACK_SETTINGS;
  const { data, error } = await sb.from("site_settings").select("*").eq("id", 1).maybeSingle();
  logError("site_settings", error);
  return data ?? FALLBACK_SETTINGS;
}

export async function getStrings(): Promise<Record<string, string>> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return {};
  const { data, error } = await sb.from("site_strings").select("key, value");
  logError("site_strings", error);
  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
}

export async function getNavigation(): Promise<NavigationItem[]> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return [];
  const { data, error } = await sb.from("navigation_items").select("*").order("sort_order");
  logError("navigation_items", error);
  return data ?? [];
}

/** All live and coming-soon products (hidden ones are filtered by RLS). */
export async function getProducts(): Promise<Product[]> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return [];
  const { data, error } = await sb.from("products").select("*").order("sort_order");
  logError("products", error);
  return data ?? [];
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const products = await getProducts();
  return products.find((p) => p.slug === slug) ?? null;
}

export async function getProductByPageSlug(pageSlug: string): Promise<Product | null> {
  const products = await getProducts();
  return products.find((p) => (p.page_slug ?? p.slug) === pageSlug) ?? null;
}

export function productHref(product: Pick<Product, "slug" | "page_slug">) {
  return `/${product.page_slug ?? product.slug}`;
}

export async function getPage(slug: string): Promise<{ page: Page; sections: PageSection[] } | null> {
  "use cache";
  cache();
  if (RESERVED_SLUGS.has(slug)) return null;
  const sb = createStaticClient();
  if (!sb) return null;
  const { data: page, error } = await sb.from("pages").select("*").eq("slug", slug).maybeSingle();
  logError(`pages/${slug}`, error);
  if (!page) return null;
  const { data: sections, error: sectionsError } = await sb
    .from("page_sections")
    .select("*")
    .eq("page_id", page.id)
    .order("sort_order");
  logError(`page_sections/${slug}`, sectionsError);
  return { page, sections: sections ?? [] };
}

export async function getPublishedPages(): Promise<Pick<Page, "slug" | "updated_at" | "show_in_sitemap">[]> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return [];
  const { data, error } = await sb.from("pages").select("slug, updated_at, show_in_sitemap");
  logError("pages", error);
  return (data ?? []).filter((p) => !RESERVED_SLUGS.has(p.slug));
}

export async function getServices(): Promise<Service[]> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return [];
  const { data, error } = await sb.from("services").select("*").order("sort_order");
  logError("services", error);
  return data ?? [];
}

export async function getFaqs(productId: string | null): Promise<Faq[]> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return [];
  const query = sb.from("faqs").select("*").order("sort_order");
  const { data, error } = await (productId ? query.eq("product_id", productId) : query.is("product_id", null));
  logError("faqs", error);
  return data ?? [];
}

export async function getTestimonials(productId: string | null): Promise<Testimonial[]> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return [];
  const query = sb.from("testimonials").select("*").order("sort_order");
  const { data, error } = await (productId ? query.eq("product_id", productId) : query);
  logError("testimonials", error);
  return data ?? [];
}

export async function getProductFeatures(productId: string): Promise<ProductFeature[]> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return [];
  const { data, error } = await sb.from("product_features").select("*").eq("product_id", productId).order("sort_order");
  logError("product_features", error);
  return data ?? [];
}

/** Visible packages of a product with their feature lists, in order. */
export async function getPackages(productId: string): Promise<PackageWithFeatures[]> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("packages")
    .select("*, features:package_features(*)")
    .eq("product_id", productId)
    .order("sort_order");
  logError("packages", error);
  return (data ?? []).map((pkg) => ({
    ...pkg,
    features: [...(pkg.features ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
}

/** Lowest monthly price per product (for "From LKR 6,900 a month"). */
export async function getStartingPrices(): Promise<Record<string, { amount: number; currency: string | null }>> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return {};
  const { data, error } = await sb
    .from("packages")
    .select("product_id, price_monthly, currency, is_active")
    .eq("is_active", true);
  logError("packages/prices", error);
  const out: Record<string, { amount: number; currency: string | null }> = {};
  for (const row of data ?? []) {
    const current = out[row.product_id];
    if (!current || row.price_monthly < current.amount) {
      out[row.product_id] = { amount: Number(row.price_monthly), currency: row.currency };
    }
  }
  return out;
}

export async function getForm(formId: string): Promise<FormDef | null> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("forms")
    .select("*, steps:form_steps(*, fields:form_fields(*))")
    .eq("id", formId)
    .maybeSingle();
  logError("forms", error);
  return data ? parseForm(data) : null;
}

export async function getOrderStatuses(): Promise<OrderStatus[]> {
  "use cache";
  cache();
  const sb = createStaticClient();
  if (!sb) return [];
  const { data, error } = await sb.from("order_statuses").select("*").order("sort_order");
  logError("order_statuses", error);
  return data ?? [];
}
