"use client";

import { Tabs } from "@retexia/ui";
import { useState, type ReactNode } from "react";
import { useT } from "@/lib/strings-context";

export type FilterKey = "all" | "active" | "in_progress" | "closed";

/**
 * Filter tabs over server-rendered groups. Each group is passed pre-rendered
 * per filter so the list itself stays a Server Component.
 */
export function OrdersFilter({
  counts,
  panels,
}: {
  counts: Record<FilterKey, number>;
  panels: Record<FilterKey, ReactNode>;
}) {
  const t = useT();
  const [value, setValue] = useState<FilterKey>("all");
  const items: { value: FilterKey; label: string; count: number }[] = [
    { value: "all", label: t("account.filter.all", "All"), count: counts.all },
    { value: "active", label: t("account.filter.active", "Active"), count: counts.active },
    { value: "in_progress", label: t("account.filter.in_progress", "In progress"), count: counts.in_progress },
    { value: "closed", label: t("account.filter.closed", "Closed"), count: counts.closed },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Tabs
        items={items}
        value={value}
        onValueChange={(v) => setValue(v as FilterKey)}
        label={t("account.filter.label", "Filter requests")}
        idPrefix="orders"
        className="self-start"
      />
      {items.map((item) => (
        <div
          key={item.value}
          id={`orders-panel-${item.value}`}
          role="tabpanel"
          aria-labelledby={`orders-tab-${item.value}`}
          hidden={value !== item.value}
          tabIndex={0}
          className="rounded-md focus-visible:focus-ring"
        >
          {panels[item.value]}
        </div>
      ))}
    </div>
  );
}
