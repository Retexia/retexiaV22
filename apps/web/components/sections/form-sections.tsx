import { Button, Card, Section, SectionHeader } from "@retexia/ui";
import { Icon } from "@retexia/ui/icon";
import { getPackages, getProductBySlug } from "@/lib/content";
import { formatPrice } from "@/lib/format";
import { telHref, whatsappHref } from "@/lib/links";
import { ContactForm } from "./contact-form";
import { PricingTable, type PricingCard } from "./pricing-table";
import { headerProps, type SectionProps } from "./types";
import { WaitlistForm } from "./waitlist-form";

/* --------------------------------------------------------------- pricing --- */

export async function PricingSection({ section, content, ctx, isFirst }: SectionProps<"pricing">) {
  const product = content.product_slug ? await getProductBySlug(content.product_slug) : ctx.product;
  if (!product) return null;
  const packages = await getPackages(product.id);
  if (!packages.length) return null;
  const { settings, t } = ctx;

  const cards: PricingCard[] = packages.map((p) => {
    const currency = p.currency ?? settings.currency_code;
    const fmt = (n: number) => formatPrice(n, currency, settings.currency_locale);
    const saving = p.price_yearly !== null ? p.price_monthly * 12 - p.price_yearly : 0;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      badge: p.badge,
      featured: p.is_featured,
      active: p.is_active && product.status === "live",
      ctaLabel: p.cta_label ?? t("pricing.choose", "Choose {name}", { name: p.name }),
      priceNote: p.price_note,
      monthly: fmt(p.price_monthly),
      yearly: p.price_yearly !== null ? fmt(p.price_yearly) : null,
      yearlySaving: saving > 0 ? t("pricing.yearly_saving", "You save {amount} a year", { amount: fmt(saving) }) : null,
      setupFee: p.setup_fee > 0 ? fmt(p.setup_fee) : null,
      features: p.features.map((f) => ({ label: f.label, included: f.included, tooltip: f.tooltip })),
    };
  });
  const finePrint = Array.from(new Set(packages.map((p) => p.fine_print).filter((x): x is string => Boolean(x))));

  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <PricingTable
        packages={cards}
        getStartedBase={`/${product.page_slug ?? product.slug}/get-started`}
        showYearlyToggle={content.show_yearly_toggle}
        finePrint={finePrint}
        note={content.note}
      />
    </Section>
  );
}

/* --------------------------------------------------------------- contact --- */

export async function ContactSection({ section, content, ctx, isFirst }: SectionProps<"contact">) {
  const { settings, t } = ctx;
  const wa = content.show_whatsapp ? whatsappHref(settings) : null;
  const tel = telHref(settings.contact_phone);
  const details = content.show_details
    ? [
        settings.contact_email
          ? { icon: "mail", label: t("contact.email", "Email"), value: settings.contact_email, href: `mailto:${settings.contact_email}` }
          : null,
        settings.contact_phone ? { icon: "phone", label: t("contact.phone", "Phone"), value: settings.contact_phone, href: tel } : null,
        settings.address ? { icon: "map-pin", label: t("contact.address", "Address"), value: settings.address, href: null } : null,
        settings.business_hours ? { icon: "clock", label: t("contact.hours", "Hours"), value: settings.business_hours, href: null } : null,
      ].filter((d): d is NonNullable<typeof d> => d !== null)
    : [];
  const showAside = details.length > 0 || Boolean(wa);

  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <div className={showAside && content.show_form ? "grid gap-8 md:grid-cols-[1fr_320px] md:gap-12" : "mx-auto max-w-content"}>
        {content.show_form ? (
          <Card className="p-6 md:p-8">
            <ContactForm productId={ctx.product?.id ?? null} sourcePath={`/${ctx.page.slug}`} />
          </Card>
        ) : null}
        {showAside ? (
          <aside className="flex flex-col gap-6" aria-label={t("contact.details", "Contact details")}>
            {wa ? (
              <div className="flex flex-col gap-3">
                <h3 className="type-h2 text-ink">{t("contact.whatsapp_title", "Prefer WhatsApp?")}</h3>
                <p className="type-body text-ink-muted">{t("contact.whatsapp_text", "Message us and a real person will reply.")}</p>
                <Button href={wa} variant="secondary" icon={<Icon name="message-circle" size={18} />}>
                  {t("contact.whatsapp_button", "Message us on WhatsApp")}
                </Button>
              </div>
            ) : null}
            {details.length ? (
              <dl className="flex flex-col gap-4 border-t border-line pt-6">
                {details.map((d) => (
                  <div key={d.label} className="flex items-start gap-3">
                    <Icon name={d.icon} size={20} className="mt-0.5 shrink-0 text-accent" />
                    <div className="flex min-w-0 flex-col">
                      <dt className="type-small text-ink-muted">{d.label}</dt>
                      <dd className="type-body break-words text-ink">
                        {d.href ? (
                          <a href={d.href} className="rounded-sm hover:text-brand focus-visible:focus-ring">
                            {d.value}
                          </a>
                        ) : (
                          d.value
                        )}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
            ) : null}
          </aside>
        ) : null}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- waitlist --- */

export async function WaitlistSection({ section, content, ctx, isFirst }: SectionProps<"waitlist">) {
  const product = content.product_slug ? await getProductBySlug(content.product_slug) : ctx.product;
  if (!product || product.status !== "coming_soon") return null;
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"}>
      <div className="mx-auto flex max-w-content flex-col items-center gap-8 text-center">
        <SectionHeader {...headerProps(section, isFirst)} />
        <div className="w-full max-w-measure">
          <WaitlistForm productId={product.id} />
        </div>
      </div>
    </Section>
  );
}
