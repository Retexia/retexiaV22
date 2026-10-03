import { Accordion, Badge, Button, Card, Container, Section, SectionHeader, cn, productStyle } from "@retexia/ui";
import { Icon } from "@retexia/ui/icon";
import { ArrowRight } from "lucide-react";
import { SmartImage as Image } from "@/components/smart-image";
import Link from "next/link";
import { ChatMock } from "@/components/chat-mock";
import { Markdown } from "@/components/markdown";
import {
  getFaqs,
  getProductBySlug,
  getProductFeatures,
  getProducts,
  getServices,
  getStartingPrices,
  getTestimonials,
  productHref,
} from "@/lib/content";
import { formatPrice } from "@/lib/format";
import { resolveHref } from "@/lib/links";
import { headerProps, type RenderContext, type SectionProps } from "./types";

function Cta({
  cta,
  ctx,
  variant,
  size = "lg",
}: {
  cta?: { label: string; href: string };
  ctx: RenderContext;
  variant: "primary" | "secondary";
  size?: "md" | "lg";
}) {
  if (!cta) return null;
  const href = resolveHref(cta.href, ctx.settings);
  if (!href) return null;
  return (
    <Button href={href} variant={variant} size={size}>
      {cta.label}
    </Button>
  );
}

/* ------------------------------------------------------------------ hero --- */

export function HeroSection({ section, content, ctx, isFirst }: SectionProps<"hero">) {
  const small = content.size === "small";
  const visual = content.visual === "lingo_chat" || content.visual === "chat" ? "chat" : content.visual;
  return (
    <section
      id={section.anchor ?? undefined}
      className={cn(
        "overflow-x-clip",
        section.background === "sunk" ? "bg-surface-sunk" : "bg-surface",
        small ? "pt-12 pb-6 md:pt-24 md:pb-12" : "pt-12 pb-12 md:pt-24 md:pb-24",
      )}
    >
      <Container>
        <div className="flex flex-col items-center text-center">
          {content.badge ? (
            <Badge tone="product" productSlug={ctx.product?.slug} className="mb-4">
              {content.badge}
            </Badge>
          ) : null}
          <SectionHeader {...headerProps(section, isFirst, small ? "display" : "xl")} />
          {content.primary_cta || content.secondary_cta ? (
            <div className="mt-6 flex flex-col items-stretch gap-3 self-stretch sm:flex-row sm:items-center sm:justify-center sm:self-auto">
              <Cta cta={content.primary_cta} ctx={ctx} variant="primary" />
              <Cta cta={content.secondary_cta} ctx={ctx} variant="secondary" />
            </div>
          ) : null}
        </div>
        {visual === "chat" ? (
          <div className="mt-16">
            <ChatMock
              chat={content.chat}
              showHalo={content.show_halo}
              label={ctx.t("hero.chat_label", "Example WhatsApp conversation")}
              customerLabel={ctx.t("hero.chat_customer", "Customer")}
            />
          </div>
        ) : null}
        {visual === "image" && content.image_url ? (
          <div className="relative mx-auto mt-16 max-w-content">
            {content.show_halo ? (
              <div aria-hidden className="absolute -top-10 -right-10 size-64 rounded-full bg-brand-halo md:-right-24" />
            ) : null}
            <Image
              src={content.image_url}
              alt={content.image_alt ?? ""}
              width={1440}
              height={900}
              priority
              sizes="(min-width: 768px) 720px, 100vw"
              className="relative h-auto w-full rounded-lg border border-line shadow-float"
            />
          </div>
        ) : null}
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------- features --- */

export async function FeaturesSection({ section, content, ctx, isFirst }: SectionProps<"features">) {
  let items = content.items ?? [];
  if (content.source === "product") {
    const product = content.product_slug ? await getProductBySlug(content.product_slug) : ctx.product;
    if (product) {
      const features = await getProductFeatures(product.id);
      items = features.map((f) => ({ icon: f.icon ?? undefined, title: f.title, text: f.description ?? undefined }));
    }
  }
  if (!items.length) return null;
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <ul className={cn("grid gap-12 sm:grid-cols-2", content.columns === 3 ? "md:grid-cols-3" : "mx-auto max-w-content")}>
        {items.map((item) => (
          <li key={item.title} className="flex flex-col items-center gap-3 text-center">
            <Icon name={item.icon} fallback="circle-check" size={28} className="text-accent" />
            <h3 className="type-h2 text-ink">{item.title}</h3>
            {item.text ? <p className="max-w-[300px] type-body text-ink-muted">{item.text}</p> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* -------------------------------------------------------------- products --- */

export async function ProductsSection({ section, content, ctx, isFirst }: SectionProps<"products">) {
  const [products, prices] = await Promise.all([getProducts(), getStartingPrices()]);
  const list = products.filter((p) => p.status === "live" || (content.include_coming_soon && p.status === "coming_soon"));
  if (!list.length) return null;
  const { t, settings } = ctx;
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <ul className={cn("mx-auto grid gap-6", list.length > 1 ? "max-w-content md:grid-cols-2" : "max-w-measure")}>
        {list.map((p) => {
          const live = p.status === "live";
          const price = prices[p.id];
          const href = productHref(p);
          return (
            <Card as="li" key={p.id} className="flex flex-col gap-4 p-6 md:p-8">
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-full" style={productStyle(p.slug)}>
                  <Icon name={p.icon} fallback="box" size={22} />
                </span>
                {content.show_status ? (
                  live ? (
                    <Badge tone="success">{t("product.status.live", "Available now")}</Badge>
                  ) : (
                    <Badge tone="neutral">{t("product.status.coming_soon", "Coming soon")}</Badge>
                  )
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="type-h2 text-ink">{p.name}</h3>
                {p.tagline ? <p className="type-body-lg text-ink-muted">{p.tagline}</p> : null}
              </div>
              {live && price ? (
                <p className="type-small text-ink-muted">
                  {t("product.from_price", "From {price} a month", {
                    price: formatPrice(price.amount, price.currency ?? settings.currency_code, settings.currency_locale),
                  })}
                </p>
              ) : null}
              <div className="mt-auto pt-2">
                <Link
                  href={live ? href : `${href}#waitlist`}
                  className="inline-flex items-center gap-2 rounded-full type-label text-brand transition-hover hover:text-brand-hover focus-visible:focus-ring"
                >
                  {live ? t("product.learn_more", "Learn more") : t("product.join_waitlist", "Join the waitlist")}
                  <span className="sr-only">: {p.name}</span>
                  <ArrowRight aria-hidden size={16} strokeWidth={1.5} />
                </Link>
              </div>
            </Card>
          );
        })}
      </ul>
    </Section>
  );
}

/* -------------------------------------------------------------- services --- */

export async function ServicesSection({ section, ctx, isFirst }: SectionProps<"services">) {
  const services = await getServices();
  if (!services.length) return null;
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => {
          const inner = (
            <>
              <Icon name={s.icon} fallback="sparkle" size={28} className="text-accent" />
              <h3 className="type-h2 text-ink">{s.title}</h3>
              {s.description ? <p className="type-body text-ink-muted">{s.description}</p> : null}
            </>
          );
          return (
            <Card as="li" key={s.id} padded={false}>
              {s.href ? (
                <Link href={s.href} className="flex h-full flex-col gap-3 rounded-lg p-6 transition-hover hover:bg-surface-sunk/40 focus-visible:focus-ring">
                  {inner}
                </Link>
              ) : (
                <div className="flex h-full flex-col gap-3 p-6">{inner}</div>
              )}
            </Card>
          );
        })}
      </ul>
      <p className="mt-8 text-center type-body text-ink-muted">
        {ctx.t("services.cta_text", "Have something in mind?")}{" "}
        <Link href="/contact" className="text-link underline-offset-4 hover:underline">
          {ctx.t("services.cta_link", "Tell us about it")}
        </Link>
      </p>
    </Section>
  );
}

/* ----------------------------------------------------------------- steps --- */

export function StepsSection({ section, content, isFirst }: SectionProps<"steps">) {
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <ol className="grid gap-12 md:grid-cols-3 md:gap-8">
        {content.items.map((item, i) => (
          <li key={item.title} className="flex flex-col items-center gap-3 text-center">
            <span className="relative flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Icon name={item.icon} fallback="circle" size={24} />
              <span
                aria-hidden
                className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full border border-line bg-surface-raised type-caption text-ink"
              >
                {i + 1}
              </span>
            </span>
            <h3 className="type-h2 text-ink">
              <span className="sr-only">{i + 1}. </span>
              {item.title}
            </h3>
            {item.text ? <p className="max-w-[300px] type-body text-ink-muted">{item.text}</p> : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ----------------------------------------------------------------- about --- */

export function AboutSection({ section, content, isFirst }: SectionProps<"about">) {
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <div className="mx-auto flex max-w-content flex-col gap-12">
        {content.body ? <Markdown className="text-center [&_p]:mx-auto [&_p]:max-w-[560px]">{content.body}</Markdown> : null}
        {content.stats.length ? (
          <dl className="grid gap-6 sm:grid-cols-3">
            {content.stats.map((s) => (
              <Card key={s.label} className="flex flex-col items-center gap-1 text-center">
                <dt className="order-2 type-body text-ink-muted">{s.label}</dt>
                <dd className="order-1 font-display text-[36px] leading-[44px] font-light tracking-[-0.015em] text-accent">{s.value}</dd>
              </Card>
            ))}
          </dl>
        ) : null}
        {content.image_url ? (
          <Image
            src={content.image_url}
            alt={content.image_alt ?? ""}
            width={1440}
            height={900}
            sizes="(min-width: 768px) 720px, 100vw"
            className="h-auto w-full rounded-lg border border-line shadow-soft"
          />
        ) : null}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- faq --- */

export async function FaqSection({ section, content, ctx, isFirst }: SectionProps<"faq">) {
  const product = content.product_slug ? await getProductBySlug(content.product_slug) : null;
  if (content.product_slug && !product) return null;
  const faqs = await getFaqs(product?.id ?? null);
  if (!faqs.length) return null;
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <div className="mx-auto max-w-content">
        <Accordion
          items={faqs.map((f) => ({
            id: f.id,
            title: f.question,
            content: <Markdown size="sm">{f.answer}</Markdown>,
          }))}
        />
        <p className="mt-8 text-center type-body text-ink-muted">
          {ctx.t("faq.more_questions", "Still have a question?")}{" "}
          <Link href="/contact" className="text-link underline-offset-4 hover:underline">
            {ctx.t("faq.contact_link", "Talk to us")}
          </Link>
        </p>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------- testimonials --- */

export async function TestimonialsSection({ section, content, isFirst }: SectionProps<"testimonials">) {
  const product = content.product_slug ? await getProductBySlug(content.product_slug) : null;
  if (content.product_slug && !product) return null;
  const testimonials = await getTestimonials(product?.id ?? null);
  if (!testimonials.length) return null;
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <ul className={cn("mx-auto grid gap-6", testimonials.length > 1 ? "md:grid-cols-2 lg:grid-cols-3" : "max-w-content")}>
        {testimonials.map((q) => (
          <Card as="li" key={q.id}>
            <figure className="flex h-full flex-col gap-4">
              <blockquote className="type-body-lg text-ink">“{q.quote}”</blockquote>
              <figcaption className="mt-auto flex items-center gap-3">
                {q.avatar_url ? (
                  <Image src={q.avatar_url} alt="" width={40} height={40} className="size-10 rounded-full object-cover" />
                ) : null}
                <span className="flex flex-col">
                  <span className="type-label text-ink">{q.author_name}</span>
                  {q.author_role || q.company ? (
                    <span className="type-small text-ink-muted">{[q.author_role, q.company].filter(Boolean).join(", ")}</span>
                  ) : null}
                </span>
              </figcaption>
            </figure>
          </Card>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------- cta --- */

export function CtaSection({ section, content, ctx, isFirst }: SectionProps<"cta">) {
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"}>
      <div className="flex flex-col items-center text-center">
        <SectionHeader {...headerProps(section, isFirst)} />
        {content.primary_cta || content.secondary_cta ? (
          <div className="mt-6 flex flex-col items-stretch gap-3 self-stretch sm:flex-row sm:items-center sm:justify-center sm:self-auto">
            <Cta cta={content.primary_cta} ctx={ctx} variant="primary" />
            <Cta cta={content.secondary_cta} ctx={ctx} variant="secondary" />
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- rich text --- */

export function RichTextSection({ section, content, isFirst }: SectionProps<"rich_text">) {
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"} header={headerProps(section, isFirst)}>
      <div className="mx-auto max-w-content">
        <Markdown>{content.body}</Markdown>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ image text --- */

export function ImageTextSection({ section, content, ctx, isFirst }: SectionProps<"image_text">) {
  return (
    <Section id={section.anchor ?? undefined} background={section.background as "surface" | "sunk"}>
      <div className={cn("grid items-center gap-12 md:grid-cols-2", content.image_side === "left" && "md:[&>*:first-child]:order-2")}>
        <div className="flex flex-col gap-6">
          <SectionHeader {...headerProps(section, isFirst)} align="left" />
          {content.body ? <Markdown>{content.body}</Markdown> : null}
          {content.cta ? (
            <div>
              <Cta cta={content.cta} ctx={ctx} variant="primary" size="md" />
            </div>
          ) : null}
        </div>
        <Image
          src={content.image_url}
          alt={content.image_alt}
          width={1200}
          height={900}
          sizes="(min-width: 768px) 520px, 100vw"
          className="h-auto w-full rounded-lg border border-line shadow-float"
        />
      </div>
    </Section>
  );
}
