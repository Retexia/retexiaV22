/** Price like "LKR 14,900" using the site's locale and currency. */
export function formatPrice(
  amount: number | string | null | undefined,
  currency: string,
  locale = "en-LK",
): string {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    })
      .format(n)
      .replace(/\u00a0/g, " ");
  } catch {
    return `${currency} ${n.toLocaleString("en")}`;
  }
}

export function formatDate(value: string | Date | null | undefined, locale = "en-LK", withTime = false): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Asia/Colombo",
  }).format(date);
}
