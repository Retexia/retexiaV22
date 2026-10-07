import type { ReactNode } from "react";
import type { StaffContext } from "@/lib/auth";
import { LingoAccountsTab } from "./lingo/accounts-tab";
import { LingoRequestPanel } from "./lingo/request-panel";
import { PostBusinessesTab } from "./post/businesses-tab";
import { PostRequestPanel } from "./post/request-panel";

/**
 * Optional product-specific admin code.
 *
 * Every product works without an entry here: its hub, packages, form, service
 * fields and n8n actions all come from the database. Add an entry only when a
 * product needs a screen the generic admin can't express (for example a live
 * usage chart read from that product's own API).
 *
 *   export const productExtensions: Record<string, ProductExtension> = {
 *     lingo: {
 *       hubTabs: [{ key: "usage", label: "Usage", render: (ctx) => <LingoUsage productId={ctx.productId} /> }],
 *     },
 *   };
 *
 * Keys are product slugs. Tabs are server-rendered; they receive the staff
 * context (Supabase client with the signed-in user's permissions) and must
 * check capabilities themselves when they show anything sensitive.
 */
export type HubTabContext = { staff: StaffContext; productId: string; productSlug: string };
export type RequestPanelContext = { staff: StaffContext; orderId: string; productSlug: string };

export type ProductExtension = {
  /** Extra tabs on /products/<slug>. */
  hubTabs?: { key: string; label: string; render: (ctx: HubTabContext) => ReactNode | Promise<ReactNode> }[];
  /** Extra cards on a request's Setup tab. */
  requestPanels?: { key: string; render: (ctx: RequestPanelContext) => ReactNode | Promise<ReactNode> }[];
};

export const productExtensions: Record<string, ProductExtension> = {
  lingo: {
    hubTabs: [{ key: "accounts", label: "Bot accounts", render: (ctx) => <LingoAccountsTab {...ctx} /> }],
    requestPanels: [{ key: "lingo-account", render: (ctx) => <LingoRequestPanel {...ctx} /> }],
  },
  post: {
    hubTabs: [{ key: "businesses", label: "Businesses", render: (ctx) => <PostBusinessesTab {...ctx} /> }],
    requestPanels: [{ key: "post-business", render: (ctx) => <PostRequestPanel {...ctx} /> }],
  },
};

export function productExtension(slug: string | null | undefined): ProductExtension {
  return (slug && productExtensions[slug]) || {};
}
