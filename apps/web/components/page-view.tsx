import { productAccentVars } from "@retexia/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionRenderer } from "@/components/sections/section-renderer";
import { getPackages, getPage, getProducts, getSiteSettings, type Page, type Product, type SiteSettings } from "@/lib/content";
import { siteUrl } from "@/lib/site-url";
import { getT } from "@/lib/strings.server";

/** Metadata for a CMS page from pages + site_settings. */
export async function pageMetadata(slug: string): Promise<Metadata> {
  const [data, settings] = await Promise.all([getPage(slug), getSiteSettings()]);
  if (!data || !data.page.is_published) return {};
  const { page } = data;
  const title = page.seo_title ?? page.title;
  const description = page.seo_description ?? settings.seo_default_description ?? undefined;
  const url = slug ? `/${slug}` : "/";
  return {
    // The home page and pages with a full seo_title skip the "%s · Retexia" template.
    title: slug === "" || page.seo_title ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      ...(page.og_image_url ? { images: [{ url: page.og_image_url }] } : {}),
    },
  };
}

function organizationLd(settings: SiteSettings) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.site_name,
    url: siteUrl(),
    description: settings.seo_default_description ?? settings.tagline ?? undefined,
    ...(settings.logo_url ? { logo: settings.logo_url } : {}),
    ...(settings.contact_email ? { email: settings.contact_email } : {}),
    ...(settings.contact_phone ? { telephone: settings.contact_phone } : {}),
    ...(settings.address ? { address: settings.address } : {}),
    sameAs: Array.isArray(settings.social_links)
      ? (settings.social_links as { url?: string }[]).map((s) => s?.url).filter(Boolean)
      : [],
  };
}

async function productLd(product: Product, page: Page, settings: SiteSettings) {
  const packages = (await getPackages(product.id)).filter((p) => p.is_active);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? product.tagline ?? undefined,
    brand: { "@type": "Brand", name: settings.site_name },
    url: `${siteUrl()}/${page.slug}`,
    ...(product.status === "live" && packages.length
      ? {
          offers: packages.map((p) => ({
            "@type": "Offer",
            name: p.name,
            price: Number(p.price_monthly).toFixed(2),
            priceCurrency: p.currency ?? settings.currency_code,
            availability: "https://schema.org/InStock",
            url: `${siteUrl()}/${page.slug}#pricing`,
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: Number(p.price_monthly).toFixed(2),
              priceCurrency: p.currency ?? settings.currency_code,
              unitCode: "MON",
            },
          })),
        }
      : {}),
  };
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output with "<" escaped cannot break out of the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** Renders a CMS page (home, product pages, contact, legal, any new page). */
export async function PageView({ slug }: { slug: string }) {
  const [data, settings, products, t] = await Promise.all([getPage(slug), getSiteSettings(), getProducts(), getT()]);
  if (!data || !data.page.is_published) notFound();
  const { page, sections } = data;
  const product = page.product_id ? (products.find((p) => p.id === page.product_id) ?? null) : null;
  // A product page disappears with its product (status hidden).
  if (page.product_id && !product) notFound();

  return (
    <div style={product ? productAccentVars(product.slug) : undefined}>
      {slug === "" ? <JsonLd data={organizationLd(settings)} /> : null}
      {product ? <JsonLd data={await productLd(product, page, settings)} /> : null}
      <SectionRenderer sections={sections} ctx={{ settings, page, product, t }} />
    </div>
  );
}
