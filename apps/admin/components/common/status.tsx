import { ProductChip, StatusBadge, type Tone } from "@retexia/ui";

export function OrderStatus({ label, tone, fallback }: { label?: string | null; tone?: string | null; fallback?: string | null }) {
  return <StatusBadge tone={(tone as Tone) ?? "neutral"} label={label ?? fallback ?? "Unknown"} />;
}

export function ProductTag({ slug, name }: { slug?: string | null; name?: string | null }) {
  if (!slug) return null;
  return <ProductChip slug={slug} name={name ?? slug} size="sm" />;
}

export const paymentStatusTone: Record<string, Tone> = {
  pending: "warning",
  confirmed: "success",
  failed: "danger",
  refunded: "neutral",
};

export const label = (value: string | null | undefined) =>
  (value ?? "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
