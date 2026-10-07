import type { CustomerStats, Lang, LingoCustomerRow, OrderStatus } from "./db.types";

export const money = (n: number | null | undefined) => `Rs. ${Math.round(Number(n ?? 0)).toLocaleString("en-US")}`;

export const LANG_LABEL: Record<Lang, string> = { si: "Sinhala", singlish: "Singlish", en: "English", ta: "Tamil" };
export const LANGS = (Object.keys(LANG_LABEL) as Lang[]).map((value) => ({ value, label: LANG_LABEL[value] }));

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" }> = {
  draft: { label: "Not confirmed", tone: "neutral" },
  confirmed: { label: "New order", tone: "warning" },
  processing: { label: "Packing", tone: "brand" },
  shipped: { label: "Sent", tone: "brand" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

/** Next steps the owner can take, in order. */
export const ORDER_NEXT: Record<OrderStatus, OrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: ["confirmed"],
};

/** Suggested WhatsApp note when the owner moves an order, in the customer's language. */
export function statusMessage(status: OrderStatus, lang: Lang | null, o: { id: number; product: string | null; customer: string | null; business: string }) {
  const name = o.customer?.split(" ")[0] ?? "";
  const si = lang === "si";
  const sl = lang === "singlish";
  const product = o.product ?? (si ? "ඇණවුම" : "order");
  switch (status) {
    case "confirmed":
      return si ? `${name} ඔබගේ ${product} ඇණවුම (#${o.id}) තහවුරු කළා ✅` : sl ? `${name} oyage ${product} order eka (#${o.id}) confirm kala ✅` : `Hi ${name}, your ${product} order (#${o.id}) is confirmed ✅`;
    case "processing":
      return si ? `${name} ඔබගේ ඇණවුම (#${o.id}) සූදානම් කරමින් පවතී 📦` : sl ? `${name} oyage order eka (#${o.id}) pack karanawa 📦` : `Hi ${name}, we're packing your order (#${o.id}) 📦`;
    case "shipped":
      return si ? `${name} ඔබගේ ${product} ඇණවුම (#${o.id}) යැව්වා 🚚 ළඟදීම ලැබේවි.` : sl ? `${name} oyage ${product} order eka (#${o.id}) yawwa 🚚 ikmanin labei.` : `Hi ${name}, your ${product} order (#${o.id}) is on its way 🚚`;
    case "delivered":
      return si ? `${name} ඔබගේ ඇණවුම ලැබුණා කියලා හිතනවා 🎉 ස්තූතියි! - ${o.business}` : sl ? `${name} oyage order eka labuna kiyala hithanawa 🎉 sthuthi! - ${o.business}` : `Hi ${name}, your order has been delivered 🎉 Thank you! - ${o.business}`;
    case "cancelled":
      return si ? `${name} ඔබගේ ඇණවුම (#${o.id}) අවලංගු කළා.` : sl ? `${name} oyage order eka (#${o.id}) cancel kala.` : `Hi ${name}, your order (#${o.id}) has been cancelled.`;
    default:
      return "";
  }
}

export type Stage = "repeat" | "customer" | "about_to_order" | "cancelled" | "browsing" | "new";
export const STAGE: Record<Stage, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger"; hint: string }> = {
  repeat: { label: "Repeat customer", tone: "success", hint: "Ordered more than once" },
  customer: { label: "Customer", tone: "success", hint: "Ordered once" },
  about_to_order: { label: "About to order", tone: "warning", hint: "Started an order but didn't confirm" },
  cancelled: { label: "Cancelled", tone: "danger", hint: "Last order was cancelled" },
  browsing: { label: "Interested", tone: "brand", hint: "Looked at products, no order yet" },
  new: { label: "Just asking", tone: "neutral", hint: "Chatted, no product yet" },
};

export function stageOf(c: Pick<LingoCustomerRow, "seen_products" | "selected_product">, s: CustomerStats | undefined): Stage {
  if (s?.last_order_status === "cancelled") return "cancelled";
  if ((s?.confirmed_orders ?? 0) > 1) return "repeat";
  if ((s?.confirmed_orders ?? 0) === 1) return "customer";
  if (s?.last_order_status === "draft") return "about_to_order";
  if ((c.seen_products?.length ?? 0) > 0 || c.selected_product) return "browsing";
  return "new";
}

export const displayName = (c: Pick<LingoCustomerRow, "customer_name" | "whatsapp_name" | "number">) => c.customer_name || c.whatsapp_name || (c.number ? `+${c.number}` : "Customer");

/** Fixed replies the bot uses, with plain-language names. */
export const REPLY_KEYS: { key: string; label: string; group: string }[] = [
  { key: "greeting", label: "Greeting (hi, hello)", group: "Conversation" },
  { key: "thanks", label: "When they say thanks", group: "Conversation" },
  { key: "error_fallback", label: "When Lingo isn't sure", group: "Conversation" },
  { key: "all_products", label: "Product list", group: "Products" },
  { key: "price_reply", label: "Price answer", group: "Products" },
  { key: "avail_yes", label: "Yes, it's available", group: "Products" },
  { key: "not_found", label: "Product not found", group: "Products" },
  { key: "recommend", label: "Recommending a product", group: "Products" },
  { key: "ask_which_product", label: "Asking which product", group: "Products" },
  { key: "fu_product", label: "Line after a product answer", group: "Products" },
  { key: "ask_details", label: "Asking for name, address, phone", group: "Orders" },
  { key: "order_summary", label: "Order summary", group: "Orders" },
  { key: "fu_confirm", label: "Asking to confirm", group: "Orders" },
  { key: "order_confirmed", label: "Order confirmed", group: "Orders" },
  { key: "order_updated", label: "Order updated", group: "Orders" },
  { key: "order_cancelled", label: "Order cancelled", group: "Orders" },
  { key: "ask_cancel_reason", label: "Asking why they cancelled", group: "Orders" },
  { key: "thanks_feedback", label: "Thanks for the feedback", group: "Orders" },
  { key: "orders_list", label: "Their orders", group: "Orders" },
  { key: "no_orders", label: "No orders yet", group: "Orders" },
  { key: "delivery_time", label: "Delivery time", group: "Delivery" },
  { key: "fu_delivery_time", label: "Line after delivery time", group: "Delivery" },
  { key: "delivery_price", label: "Delivery charge", group: "Delivery" },
  { key: "fu_delivery_price", label: "Line after delivery charge", group: "Delivery" },
  { key: "our_details", label: "About the shop", group: "Shop" },
  { key: "contact", label: "Contact details", group: "Shop" },
  { key: "followup_abandoned", label: "Follow-up: didn't finish ordering", group: "Follow-ups" },
  { key: "followup_confirmed", label: "Follow-up: after an order", group: "Follow-ups" },
  { key: "followup_cancelled", label: "Follow-up: after a cancellation", group: "Follow-ups" },
];

export const PLACEHOLDERS = [
  "business_name", "customer_name", "products", "product", "qty", "total", "name", "address", "phone", "missing", "orders",
  "delivery_fee", "delivery_time", "delivery_areas", "delivery_days", "contact_phone", "opening_hours", "biz_address", "location_url", "about", "payment_methods",
];
