import { Check, Info, X } from "lucide-react";
import { cn } from "../cn";
import { Button } from "./button";
import { Badge, Card } from "./display";

export type PricingCardData = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  badge: string | null;
  featured: boolean;
  active: boolean;
  ctaLabel: string;
  priceNote: string | null;
  /** Formatted prices, e.g. "LKR 14,900". */
  monthly: string;
  yearly: string | null;
  /** e.g. "You save LKR 29,800 a year". */
  yearlySaving: string | null;
  setupFee: string | null;
  features: { label: string; included: boolean; tooltip: string | null }[];
};

export type PricingCardLabels = {
  perMonth: string;
  perYear: string;
  monthlyOnly: string;
  setupFee: (amount: string) => string;
  noSetupFee: string;
  unavailable: string;
  included: string;
  notIncluded: string;
};

export const defaultPricingLabels: PricingCardLabels = {
  perMonth: "/ month",
  perYear: "/ year",
  monthlyOnly: "Monthly billing only",
  setupFee: (amount) => `+ ${amount} one-time setup`,
  noSetupFee: "No setup fee",
  unavailable: "Not available right now",
  included: "Included:",
  notIncluded: "Not included:",
};

/**
 * One package card, exactly as on the website's pricing section. The admin's
 * package editor renders the same component as a live preview.
 */
export function PricingCard({
  pkg,
  cycle,
  href,
  labels = defaultPricingLabels,
  className,
  as = "li",
}: {
  pkg: PricingCardData;
  cycle: "monthly" | "yearly";
  /** Where the button goes; omit for a preview (button shown, not linked). */
  href?: string;
  labels?: PricingCardLabels;
  className?: string;
  as?: "li" | "div" | "article";
}) {
  const yearly = cycle === "yearly" && pkg.yearly;
  const price = yearly ? pkg.yearly : pkg.monthly;
  return (
    <Card
      as={as}
      className={cn(
        "relative flex flex-col gap-6",
        pkg.featured && "border-brand! bg-brand-soft/40! ring-1 ring-brand",
        className,
      )}
    >
      {pkg.badge ? (
        <Badge tone="brand" className={cn("absolute -top-3 left-6", pkg.featured && "bg-brand! text-on-brand!")}>
          {pkg.badge}
        </Badge>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="type-h2 text-ink">{pkg.name}</h3>
        {pkg.tagline ? <p className="type-body text-ink-muted">{pkg.tagline}</p> : null}
      </div>
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-[30px] leading-[38px] font-light tracking-[-0.015em] text-ink">{price}</span>
          <span className="type-body text-ink-muted">{yearly ? labels.perYear : labels.perMonth}</span>
        </p>
        {cycle === "yearly" && !pkg.yearly ? <p className="type-small text-ink-muted">{labels.monthlyOnly}</p> : null}
        {yearly && pkg.yearlySaving ? <p className="type-small text-success">{pkg.yearlySaving}</p> : null}
        <p className="type-small text-ink-muted">{pkg.setupFee ? labels.setupFee(pkg.setupFee) : labels.noSetupFee}</p>
        {pkg.priceNote ? <p className="type-small text-ink-muted">{pkg.priceNote}</p> : null}
      </div>
      {pkg.active ? (
        href ? (
          <Button href={href} variant={pkg.featured ? "primary" : "secondary"} fullWidth>
            {pkg.ctaLabel}
          </Button>
        ) : (
          <Button variant={pkg.featured ? "primary" : "secondary"} fullWidth tabIndex={-1}>
            {pkg.ctaLabel}
          </Button>
        )
      ) : (
        <Button disabled variant="secondary" fullWidth>
          {labels.unavailable}
        </Button>
      )}
      {pkg.description ? <p className="type-body text-ink-muted">{pkg.description}</p> : null}
      <ul className="flex flex-col gap-3 border-t border-line pt-6">
        {pkg.features.map((f, i) => (
          <li key={`${f.label}-${i}`} className={cn("flex items-start gap-3 type-body", f.included ? "text-ink" : "text-ink-muted")}>
            {f.included ? (
              <Check aria-hidden size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand" />
            ) : (
              <X aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-line-strong" />
            )}
            <span>
              <span className="sr-only">{f.included ? labels.included : labels.notIncluded} </span>
              {f.label}
              {f.tooltip ? (
                <span className="ml-1 inline-flex align-middle text-ink-muted" title={f.tooltip}>
                  <Info aria-hidden size={14} strokeWidth={1.5} />
                  <span className="sr-only">({f.tooltip})</span>
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
