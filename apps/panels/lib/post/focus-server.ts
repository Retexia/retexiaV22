import "server-only";

import type { FocusChoices } from "./focus";
import type { PostDb } from "./post-db";

/** The business's products and groups, for the "About" drop-down and to check a chosen focus. */
export async function focusChoices(db: PostDb, businessId: string): Promise<FocusChoices> {
  const [{ data: products }, { data: groups }] = await Promise.all([
    db.from("products").select("id, name").eq("business_id", businessId).order("name"),
    db.from("product_groups").select("id, name, product_ids").eq("business_id", businessId).order("name"),
  ]);
  return {
    products: (products ?? []).map((p) => ({ id: p.id, name: p.name })),
    groups: (groups ?? []).map((g) => ({ id: g.id, name: g.name, count: g.product_ids.length })),
  };
}
