"use client";

import { PricingCard, cn, type PricingCardData, type PricingCardLabels } from "@retexia/ui";
import { useId, useState } from "react";
import { useT } from "@/lib/strings-context";

/** Package cards with a monthly / yearly switch. */
export function PricingTable({
  packages,
  getStartedBase,
  showYearlyToggle,
  finePrint,
  note,
}: {
  packages: PricingCardData[];
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
  const labels: PricingCardLabels = {
    perMonth: t("pricing.per_month", "/ month"),
    perYear: t("pricing.per_year", "/ year"),
    monthlyOnly: t("pricing.monthly_only", "Monthly billing only"),
    setupFee: (amount) => t("pricing.setup_fee", "+ {amount} one-time setup", { amount }),
    noSetupFee: t("pricing.no_setup_fee", "No setup fee"),
    unavailable: t("pricing.unavailable", "Not available right now"),
    included: t("pricing.included", "Included:"),
    notIncluded: t("pricing.not_included", "Not included:"),
  };

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
        {packages.map((p) => (
          <PricingCard
            key={p.id}
            pkg={p}
            cycle={cycle}
            href={`${getStartedBase}?package=${encodeURIComponent(p.slug)}&cycle=${cycle === "yearly" && p.yearly ? "yearly" : "monthly"}`}
            labels={labels}
            className="w-[85%] max-w-[340px] shrink-0 snap-center sm:w-[60%] md:w-auto md:max-w-none"
          />
        ))}
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
