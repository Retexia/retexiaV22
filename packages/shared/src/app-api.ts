/**
 * What /api/app/* answers (served by apps/panels/app/api/app, read by apps/mobile).
 * Errors are always `{ error: string; fieldErrors?: Record<string, string> }` with a 4xx/5xx status.
 * The app is consumption-only: nothing here carries a price of a Retexia product or a link to buy.
 */

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
export type AppProductKey = "lingo" | "post" | "feeder" | "plan";
export type AppPackage = { slug: string; name: string; open: boolean; inApp: boolean; status: string | null; trialEndsAt: string | null };
export type AppProduct = {
  key: AppProductKey;
  slug: string;
  name: string;
  shortName: string;
  icon: string | null;
  colors: { light: string; dark: string; softLight: string; softDark: string };
  open: boolean;
  status: string | null;
  trialEndsAt: string | null;
  packages: AppPackage[];
};
export type AppMe = {
  user: { id: string; email: string; name: string; business: string | null; phone: string | null };
  products: AppProduct[];
  unread: number;
  deletionRequestedAt: string | null;
};
export type Message = { message: string | null; data?: unknown };

export type PushKind = { key: string; label: string; hint: string; product: string | null };
export type NotificationPrefs = { push: boolean; muted: string[]; kinds: PushKind[] };
export type InboxItem = { id: string; event: string; title: string; body: string; url: string | null; at: string; unread: boolean };

// ---------------------------------------------------------------------------
// Lingo Feeder
// ---------------------------------------------------------------------------
export type LfStats = {
  chats_today: number; orders_today: number; sales_today: number; chats_month: number; orders_month: number; sales_month: number;
  to_export: number; call: number; unmatched_ads: number; statuses: Record<string, number>;
};
export type LfHome = {
  seller: { business_name: string; status: "setup" | "live" | "paused" | "blocked" } | null;
  number: { display_phone: string | null; verified_name: string | null; status: "pending" | "connected" | "problem" | "disabled"; quality_rating: string | null; problem: string | null; last_webhook_at: string | null } | null;
  stats: LfStats;
};
export type LfChatItem = {
  phone: string; name: string | null; status: string; status_at: string; needs_call: boolean; call_reason: string | null; paused_until: string | null;
  last_msg_at: string | null; last_in_at: string | null; product: string | null; orders: number;
  last: { role: string; content: string; at: string } | null;
};
export type LfChats = { status: string; chats: LfChatItem[]; counts: Record<string, number> };
export type LfChat = {
  phone: string; profile_name: string | null; lang: string; product_id: number | null; status: string; status_at: string; needs_call: boolean;
  call_reason: string | null; awaiting: string | null; details: { name?: string; address?: string; phone?: string; phone2?: string };
  memo: string | null; paused_until: string | null; last_in_at: string | null; last_msg_at: string | null; created_at: string; ad_id: string | null;
};
export type LfMessage = {
  id: number; role: "c" | "b" | "s"; kind: string; content: string;
  meta: { image?: string; buttons?: string[]; list?: string; rows?: string[]; reaction?: string; quote?: boolean } | null;
  status: string | null; route: string | null; created_at: string;
};
export type LfOrder = {
  id: number; phone: string; product_id: number | null; product_name: string | null; qty: number; name: string | null; address: string | null;
  phone1: string | null; phone2: string | null; unit_price: number; delivery_fee: number; total: number; status: "draft" | "confirmed" | "cancelled";
  exported_at: string | null; confirmed_at: string | null; created_at: string;
};
export type LfThread = {
  chat: LfChat;
  messages: LfMessage[];
  orders: LfOrder[];
  product: { product_id: number; name: string; picture_url: string | null } | null;
  canReply: boolean;
};
export type LfOrders = { view: "new" | "sent" | "cancelled" | "all"; orders: LfOrder[]; toExport: number };
export type LfTryReply = {
  ok: boolean; stopped?: string; status?: string; needs_call?: boolean; call_reason?: string | null; route?: string; lang?: string; log?: string;
  messages?: { kind: string; text: string; body: Record<string, unknown> }[];
  ai?: { task: string; model: string; ok: boolean; in: number; cached: number; out: number }[]; cost_usd?: number;
};
