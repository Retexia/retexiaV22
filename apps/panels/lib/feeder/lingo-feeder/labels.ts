import type { Tone } from "@retexia/ui";

/** Chat statuses in plain words (client-safe). "call" is the "call them" flag, shown like a status. */
type Info = { label: string; short: string; tone: Tone; hint: string };
export const STATUS = {
  call: { label: "Call them", short: "Call", tone: "danger", hint: "Asked for a call, a complaint, or Lingo needs you" },
  new: { label: "Only clicked the ad", short: "Clicked only", tone: "neutral", hint: "Opened the chat from the ad, said nothing yet" },
  asking: { label: "Asking about the product", short: "Asking", tone: "brand", hint: "Asking questions, no order yet" },
  ordering: { label: "Giving order details", short: "Ordering", tone: "warning", hint: "Started the order, not confirmed yet" },
  no_reply: { label: "Stopped replying", short: "No reply", tone: "warning", hint: "Lingo answered and they went quiet" },
  ordered: { label: "Ordered", short: "Ordered", tone: "success", hint: "Confirmed an order" },
  cancelled: { label: "Cancelled", short: "Cancelled", tone: "neutral", hint: "Cancelled their order" },
  not_interested: { label: "Not interested", short: "Not interested", tone: "neutral", hint: "Said no for now" },
  spam: { label: "Spam", short: "Spam", tone: "neutral", hint: "Scam links and the like: Lingo ignores them" },
} satisfies Record<string, Info>;
/** Any status key (from the database) → its words; unknown keys show as they are. */
export const statusOf = (k: string): Info => (STATUS as Record<string, Info>)[k] ?? { label: k, short: k, tone: "neutral", hint: "" };
export const STATUS_ORDER = ["call", "ordering", "asking", "no_reply", "new", "ordered", "cancelled", "not_interested", "spam"] as const;
export const SET_STATUSES = ["new", "asking", "ordering", "no_reply", "ordered", "cancelled", "not_interested", "spam"] as const;

export const LANG: Record<string, string> = { si: "Sinhala", sg: "Singlish", en: "English" };

export const lkr = (n: number | string | null | undefined) => `Rs. ${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Colombo" });
}
export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Colombo" }) : "";

/** 94771234567 → 077 123 4567 */
export function showPhone(p: string) {
  const d = String(p).replace(/\D/g, "");
  const l = /^94\d{9}$/.test(d) ? "0" + d.slice(2) : d;
  return /^0\d{9}$/.test(l) ? `${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}` : p;
}

/** Is WhatsApp's 24-hour reply window still open? */
export const windowOpen = (lastIn: string | null | undefined) => Boolean(lastIn && Date.now() - new Date(lastIn).getTime() < 24 * 3600 * 1000 - 60_000);
