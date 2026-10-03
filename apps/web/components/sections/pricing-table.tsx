"use client";

import { Badge, Button, Card, cn } from "@retexia/ui";
import { Check, Info, X } from "lucide-react";
import { useId, useState } from "react";
import { useT } from "@/lib/strings-context";

export type PricingCard = {
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
  monthly: string;
  yearly: string | null;
  /** e.g. "Save LKR 29,800 a year". */
  yearlySaving: string | null;
  setupFee: string | null;
  features: { label: string; included: boolean; tooltip: string | null }[];
};

/** Package cards with a monthly / yearly switch. */
export function PricingTable({
  packages,
  getStartedBase,
  showYearlyToggle,
  finePrint,
  note,
}: {
  packages: PricingCard[];
  /** e.g. "/lingo/get-started" */
  getStartedBase: string;
  showYearlyToggle: boolean;
  finePrint: string[];
  note?: string;
}) {
  const t = useT();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const anyYearly = packages.some((p) => p.yearly);
  const groupId = useId();

  return (
    <div className="flex flex-col items-center gap-8">
      {showYearlyToggle && anyYearly ? (
        <div role="radiogroup" aria-label={t("pricing.billing", "Billing")} className="inline-flex rounded-full border border-line bg-surface-sunk p-1">
          {(["monthly", "yearly"] as const).map((c) => (
            <label
              key={c}
              className={cn(
                "relative inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-4 type-label transition-ui has-[:focus-visible]:focus-ring",
                cycle === c ? "bg-surface-raised text-brand shadow-soft" : "text-ink-muted hover:text-ink",
              )}
            >
              <input
                type="radio"
                name={`${groupId}-cycle`}
                value={c}
                checked={cycle === c}
                onChange={() => setCycle(c)}
                className="sr-only"
              />
              {c === "monthly" ? t("pricing.monthly", "Monthly") : t("pricing.yearly", "Yearly")}
              {c === "yearly" ? (
                <span className="rounded-full bg-success-soft px-2 py-px type-caption text-success">
                  {t("pricing.yearly_badge", "2 months free")}
                </span>
              ) : null}
            </label>
          ))}
        </div>
      ) : null}

      <ul
        className="-mx-gutter flex w-[calc(100%_+_2_*_var(--rx-gutter))] snap-x snap-mandatory gap-4 overflow-x-auto px-gutter pt-3 pb-4 md:mx-0 md:grid md:w-full md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0"
        aria-label={t("pricing.plans", "Plans")}
      >
        {packages.map((p) => {
          const yearly = cycle === "yearly" && p.yearly;
          const price = yearly ? p.yearly : p.monthly;
          const effectiveCycle = yearly ? "yearly" : "monthly";
          return (
            <Card
              as="li"
              key={p.id}
              className={cn(
                "relative flex w-[85%] max-w-[340px] shrink-0 snap-center flex-col gap-6 sm:w-[60%] md:w-auto md:max-w-none",
                p.featured && "border-brand! bg-brand-soft/40! ring-1 ring-brand",
              )}
            >
              {p.badge ? (
                <Badge tone="brand" className={cn("absolute -top-3 left-6", p.featured && "bg-brand! text-on-brand!")}>
                  {p.badge}
                </Badge>
              ) : null}
              <div className="flex flex-col gap-1">
                <h3 className="type-h2 text-ink">{p.name}</h3>
                {p.tagline ? <p className="type-body text-ink-muted">{p.tagline}</p> : null}
              </div>
              <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-[30px] leading-[38px] font-light tracking-[-0.015em] text-ink">{price}</span>
                  <span className="type-body text-ink-muted">
                    {yearly ? t("pricing.per_year", "/ year") : t("pricing.per_month", "/ month")}
                  </span>
                </p>
                {cycle === "yearly" && !p.yearly ? (
                  <p className="type-small text-ink-muted">{t("pricing.monthly_only", "Monthly billing only")}</p>
                ) : null}
                {yearly && p.yearlySaving ? <p className="type-small text-success">{p.yearlySaving}</p> : null}
                <p className="type-small text-ink-muted">
                  {p.setupFee
                    ? t("pricing.setup_fee", "+ {amount} one-time setup", { amount: p.setupFee })
                    : t("pricing.no_setup_fee", "No setup fee")}
                </p>
                {p.priceNote ? <p className="type-small text-ink-muted">{p.priceNote}</p> : null}
              </div>
              {p.active ? (
                <Button
                  href={`${getStartedBase}?package=${encodeURIComponent(p.slug)}&cycle=${effectiveCycle}`}
                  variant={p.featured ? "primary" : "secondary"}
                  fullWidth
                >
                  {p.ctaLabel}
                </Button>
              ) : (
                <Button disabled variant="secondary" fullWidth>
                  {t("pricing.unavailable", "Not available right now")}
                </Button>
              )}
              {p.description ? <p className="type-body text-ink-muted">{p.description}</p> : null}
              <ul className="flex flex-col gap-3 border-t border-line pt-6">
                {p.features.map((f) => (
                  <li key={f.label} className={cn("flex items-start gap-3 type-body", f.included ? "text-ink" : "text-ink-muted")}>
                    {f.included ? (
                      <Check aria-hidden size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand" />
                    ) : (
                      <X aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-line-strong" />
                    )}
                    <span>
                      <span className="sr-only">
                        {f.included ? t("pricing.included", "Included:") : t("pricing.not_included", "Not included:")}{" "}
                      </span>
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
        })}
      </ul>

      {note || finePrint.length ? (
        <div className="flex max-w-content flex-col gap-1 text-center type-small text-ink-muted">
          {note ? <p>{note}</p> : null}
          {finePrint.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
