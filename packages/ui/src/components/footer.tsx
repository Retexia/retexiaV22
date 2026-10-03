import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { isExternalHref } from "./button";

export type FooterLink = { label: string; href: string; newTab?: boolean };
export type FooterColumn = { title: string; links: FooterLink[] };

function FooterAnchor({ link }: { link: FooterLink }) {
  const className =
    "rounded-sm type-body text-ink-muted transition-hover hover:text-ink focus-visible:focus-ring";
  if (isExternalHref(link.href) || link.newTab) {
    return (
      <a href={link.href} className={className} target={link.newTab ? "_blank" : undefined} rel="noopener noreferrer">
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

export function Footer({
  brand,
  text,
  columns,
  bottom,
  aside,
  label = "Footer",
  className,
}: {
  brand: ReactNode;
  text?: string | null;
  columns: FooterColumn[];
  /** Copyright line and similar. */
  bottom?: ReactNode;
  /** Right side of the bottom row (theme toggle, social links). */
  aside?: ReactNode;
  label?: string;
  className?: string;
}) {
  const visible = columns.filter((c) => c.links.length > 0);
  return (
    <footer className={cn("border-t border-line bg-surface", className)}>
      <div className="mx-auto w-full max-w-[calc(var(--rx-container)_+_2_*_var(--rx-gutter))] px-gutter pt-12 pb-8 md:pt-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)] md:gap-8">
          <div className="flex max-w-[320px] flex-col gap-3">
            {brand}
            {text ? <p className="type-body text-ink-muted">{text}</p> : null}
          </div>
          <nav aria-label={label} className="contents">
            {visible.map((col) => (
              <div key={col.title} className="flex flex-col gap-3">
                <h2 className="type-eyebrow text-ink-muted">{col.title}</h2>
                <ul className="flex flex-col gap-2">
                  {col.links.map((l) => (
                    <li key={l.href + l.label}>
                      <FooterAnchor link={l} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-12 flex flex-col-reverse gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="type-small text-ink-muted">{bottom}</div>
          {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
        </div>
      </div>
    </footer>
  );
}
