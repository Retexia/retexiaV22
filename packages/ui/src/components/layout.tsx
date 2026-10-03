import type { ElementType, ReactNode } from "react";
import { cn } from "../cn";

/** Page column: 1040px max, 24px side gutter. */
export function Container({
  children,
  className,
  size = "page",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  size?: "page" | "content" | "measure";
  as?: ElementType;
}) {
  return (
    <As
      className={cn(
        "mx-auto w-full px-gutter",
        size === "page" && "max-w-[calc(var(--rx-container)_+_2_*_var(--rx-gutter))]",
        size === "content" && "max-w-[calc(var(--rx-content)_+_2_*_var(--rx-gutter))]",
        size === "measure" && "max-w-[calc(var(--rx-measure)_+_2_*_var(--rx-gutter))]",
        className,
      )}
    >
      {children}
    </As>
  );
}

/** Title with the `highlight` word(s) in the accent colour. */
export function Highlight({ text, highlight }: { text: string; highlight?: string | null }) {
  if (!highlight) return <>{text}</>;
  const index = text.indexOf(highlight);
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <span className="text-accent">{highlight}</span>
      {text.slice(index + highlight.length)}
    </>
  );
}

export type SectionHeaderProps = {
  eyebrow?: string | null;
  title?: string | null;
  highlight?: string | null;
  subtitle?: string | null;
  /** h1 for the first section of a page, h2 otherwise. */
  as?: "h1" | "h2";
  /** display-xl (hero), display (product titles) or heading-1 (sections). */
  size?: "xl" | "display" | "h1";
  align?: "center" | "left";
  className?: string;
  id?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  highlight,
  subtitle,
  as: Heading = "h2",
  size = "h1",
  align = "center",
  className,
  id,
}: SectionHeaderProps) {
  if (!eyebrow && !title && !subtitle) return null;
  return (
    <header className={cn("flex flex-col gap-3", align === "center" ? "items-center text-center" : "items-start", className)}>
      {eyebrow ? <p className="type-eyebrow text-accent">{eyebrow}</p> : null}
      {title ? (
        <Heading
          id={id}
          className={cn(
            "max-w-content text-balance text-ink",
            size === "xl" && "type-display-xl",
            size === "display" && "type-display",
            size === "h1" && "type-h1",
          )}
        >
          <Highlight text={title} highlight={highlight} />
        </Heading>
      ) : null}
      {subtitle ? (
        <p className={cn("type-body-lg max-w-measure text-pretty text-ink-muted", size === "xl" && "mt-1")}>{subtitle}</p>
      ) : null}
    </header>
  );
}

/** A page band: surface or sunk background, 96px apart on desktop, 48px on mobile. */
export function Section({
  id,
  background = "surface",
  children,
  className,
  header,
  labelledBy,
}: {
  id?: string;
  background?: "surface" | "sunk";
  children?: ReactNode;
  className?: string;
  header?: SectionHeaderProps;
  labelledBy?: string;
}) {
  const headingId = header?.title ? (id ? `${id}-title` : undefined) : undefined;
  return (
    <section
      id={id}
      aria-labelledby={labelledBy ?? headingId}
      className={cn("py-12 md:py-24", background === "sunk" ? "bg-surface-sunk" : "bg-surface", className)}
    >
      <Container>
        {header ? <SectionHeader {...header} id={header.id ?? headingId} /> : null}
        {children ? <div className={cn(header && (header.title || header.subtitle) && "mt-8 md:mt-12")}>{children}</div> : null}
      </Container>
    </section>
  );
}
