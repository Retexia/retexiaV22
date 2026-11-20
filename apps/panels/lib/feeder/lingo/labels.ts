import type { Tone } from "@retexia/ui";

/** Plain words for Lingo's states, routes and texts (client-safe). */
export const STAGE: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "neutral" },
  browsing: { label: "Asking", tone: "brand" },
  collecting: { label: "Giving details", tone: "brand" },
  confirming: { label: "Confirming", tone: "warning" },
  ordered: { label: "Ordered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  handoff: { label: "Needs you", tone: "danger" },
};

/** How a bot turn was answered, and its cost level (0 = code … 4 = you). */
export const ROUTE: Record<string, { label: string; level: number; hint: string }> = {
  rule: { label: "Rule", level: 0, hint: "Quick rule, no AI" },
  tap: { label: "Button", level: 0, hint: "Button tap, no AI" },
  fixed: { label: "Fixed text", level: 1, hint: "Understood by the small AI, answered with your fixed text" },
  faq: { label: "FAQ", level: 2, hint: "Answered from your FAQs" },
  cache: { label: "Saved answer", level: 2, hint: "An answer Lingo gave before for the same question" },
  ai: { label: "AI", level: 3, hint: "Written by the AI from your product details" },
  human: { label: "Sent to you", level: 4, hint: "Handed to you in the Inbox" },
};
export const LEVELS = [
  { level: 0, label: "Level 0 · code", hint: "Taps and quick rules" },
  { level: 1, label: "Level 1 · small AI", hint: "Understood, fixed text" },
  { level: 2, label: "Level 2 · stored", hint: "FAQs and saved answers" },
  { level: 3, label: "Level 3 · reply AI", hint: "Written answers" },
  { level: 4, label: "Level 4 · you", hint: "Handed to you" },
];

export const LANG: Record<string, string> = { si: "Sinhala", sg: "Singlish", en: "English" };
export const DELIVERY: Record<string, string> = { dispatched: "Dispatched", delivered: "Delivered", returned: "Returned" };

export type FixedKind = "text" | "body" | "button" | "list_button";
/** Every fixed text a customer can get, grouped, with its limit (WhatsApp's). */
export const FIXED: { group: string; items: { key: string; label: string; kind: FixedKind; hint?: string }[] }[] = [
  {
    group: "Order",
    items: [
      { key: "ask_details", label: "Ask for details", kind: "text", hint: "After the product photo, and when they tap Order." },
      { key: "nudge", label: "Order reminder", kind: "text", hint: "Added after answers while there are no details yet." },
      { key: "ask_missing", label: "Ask for missing details", kind: "text", hint: "{missing} = what's still needed." },
      { key: "order_summary", label: "Order summary", kind: "body", hint: "Sent with the Confirm / Change / Cancel buttons." },
      { key: "ask_change", label: "Ask what to change", kind: "text" },
      { key: "order_confirmed", label: "Order confirmed", kind: "text" },
      { key: "order_cancelled", label: "Order cancelled", kind: "text" },
    ],
  },
  {
    group: "Answers (no AI)",
    items: [
      { key: "price", label: "Price", kind: "text" },
      { key: "delivery", label: "Delivery", kind: "text" },
      { key: "payment", label: "Payment", kind: "text" },
      { key: "stock", label: "Stock", kind: "text", hint: "Leave empty and Lingo says it will check, then hands the chat to you." },
      { key: "contact", label: "Contact", kind: "text" },
      { key: "shop", label: "Shop details", kind: "text" },
      { key: "chat_reply", label: "Thanks / ok", kind: "text" },
    ],
  },
  {
    group: "Products and help",
    items: [
      { key: "ask_product", label: "Which product?", kind: "text" },
      { key: "pick_product", label: "Product menu", kind: "body" },
      { key: "clarify", label: "Not sure what they mean", kind: "body", hint: "Sent with Order / More details / Talk to us buttons." },
      { key: "handoff", label: "Handed to you", kind: "text" },
      { key: "will_check", label: "We'll check and reply", kind: "text" },
    ],
  },
  {
    group: "Buttons",
    items: [
      { key: "btn_order", label: "Order", kind: "button" },
      { key: "btn_confirm", label: "Confirm", kind: "button" },
      { key: "btn_change", label: "Change", kind: "button" },
      { key: "btn_cancel", label: "Cancel", kind: "button" },
      { key: "btn_info", label: "More details", kind: "button" },
      { key: "btn_human", label: "Talk to us", kind: "button" },
      { key: "btn_menu", label: "Product menu button", kind: "list_button" },
    ],
  },
  {
    group: "Follow-ups",
    items: [
      { key: "notify_confirmed", label: "After an order", kind: "text" },
      { key: "notify_cancelled", label: "After a cancel", kind: "text" },
      { key: "notify_no_order", label: "No order yet", kind: "body", hint: "Sent with the Order button." },
    ],
  },
];
export const FIXED_KEYS = FIXED.flatMap((g) => g.items.map((i) => i.key));
export const LIMIT: Record<FixedKind, number> = { text: 4096, body: 1024, button: 20, list_button: 20 };
export const PLACEHOLDERS = ["{business}", "{name}", "{product}", "{price}", "{delivery_fee}", "{total}", "{qty}", "{address}", "{contact}", "{missing}", "{shop_phone}", "{shop_address}", "{delivery_days}"];

export const money = (n: number | string | null | undefined) => `Rs. ${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export const usd = (n: number | string | null | undefined, digits = 2) => `US$${Number(n ?? 0).toFixed(digits)}`;
export const chars = (s: string) => Array.from(s).length;

export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
/** WhatsApp lets a business send free text only within 24 h of the customer's last message. */
export const windowOpen = (lastInAt: string | null | undefined, now = Date.now()) => Boolean(lastInAt && now - new Date(lastInAt).getTime() < 24 * 3600 * 1000);
export const showPhone = (p: string) => (p.startsWith("94") && p.length === 11 ? `0${p.slice(2, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p);
