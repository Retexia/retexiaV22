import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { AccessError } from "../action";
import { getCustomer, requirePayingCustomer, orderSetupValue, type PayingCustomer } from "../customer";
import { TENANT_COLUMNS, lingoDb, type LingoDb } from "./db";
import type { LingoUserRow } from "./db.types";

const SLUG = () => process.env.LINGO_PRODUCT_SLUG || "lingo";
/** Setup field (Retexia admin → request → Setup) that links an order to its lingo_users row. */
export const LINK_FIELD = "lingo_account_id";

export type Tenant = Omit<LingoUserRow, "evolution_apikey" | "evolution_base_url" | "updated_at">;
export type LingoContext = { customer: PayingCustomer; tenant: Tenant; db: LingoDb };

/**
 * The customer's bot account: lingo_users.owner_id = their Retexia login.
 * Fallback: the "Lingo account ID" the team filled on the order's Setup tab;
 * an unclaimed account is linked to the customer on first visit.
 */
export const tenantFor = cache(async (customerId: string, orderId: string): Promise<Tenant | null> => {
  const db = lingoDb();
  const { data: own } = await db.from("lingo_users").select(TENANT_COLUMNS).eq("owner_id", customerId).order("id").limit(1).maybeSingle();
  if (own) return own as Tenant;
  const id = Number(await orderSetupValue(orderId, LINK_FIELD));
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const { data: claimed } = await db.from("lingo_users").update({ owner_id: customerId }).eq("id", id).is("owner_id", null).select(TENANT_COLUMNS).maybeSingle();
  return (claimed as Tenant | null) ?? null;
});

/** For pages: paying Lingo customer whose bot account is linked, or the right screen. */
export async function requireLingoPage(path = "/"): Promise<LingoContext> {
  const customer = await requirePayingCustomer(SLUG(), path);
  const tenant = await tenantFor(customer.id, customer.order.id);
  if (!tenant) redirect("/setting-up");
  return { customer, tenant, db: lingoDb() };
}

/** For server actions: throws unless the caller owns a linked Lingo account. Use ctx.tenant.id in every query. */
export async function requireLingo(): Promise<LingoContext> {
  const customer = await getCustomer(SLUG());
  if (!customer) throw new AccessError("Please sign in again.");
  if (!customer.order) throw new AccessError("Lingo is not active on your account.");
  const tenant = await tenantFor(customer.id, customer.order.id);
  if (!tenant) throw new AccessError("Your Lingo account is still being set up.");
  return { customer: customer as PayingCustomer, tenant, db: lingoDb() };
}

export const lingoCustomer = () => getCustomer(SLUG());
