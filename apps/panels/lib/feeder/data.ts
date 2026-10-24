import "server-only";

import { feederDb } from "./db";

export type CatalogProduct = { product_id: number; product_name: string; price: number; delivery_fee: number };
export type MyProduct = CatalogProduct & { form_names: string[]; my_price: number | null };
export type FeederCustomer = { name: string | null; crm_links: string[] };

/** Feeder's products (active), for the "Add product" search. */
export async function catalog(): Promise<CatalogProduct[]> {
  const { data, error } = await feederDb().from("products").select("product_id, product_name, price, delivery_fee").eq("active", true).order("product_name");
  if (error) throw new Error(`Feeder products: ${error.message}`);
  return (data ?? []).map((p) => ({ product_id: p.product_id, product_name: p.product_name, price: Number(p.price), delivery_fee: Number(p.delivery_fee) }));
}

/** The customer's Feeder row (null = not set up yet) and their products with form names. */
export async function mySetup(userId: string): Promise<{ customer: FeederCustomer | null; products: MyProduct[] }> {
  const db = feederDb();
  const [{ data: c, error }, { data: rows }] = await Promise.all([
    db.from("customers").select("name, crm_links").eq("user_id", userId).maybeSingle(),
    db.from("customer_products").select("product_id, form_names, price, created_at, products(product_name, price, delivery_fee)").eq("user_id", userId).order("created_at"),
  ]);
  if (error) throw new Error(`Feeder customer: ${error.message}`);
  const products = ((rows ?? []) as unknown as { product_id: number; form_names: string[]; price: number | null; products: { product_name: string; price: number; delivery_fee: number } | null }[])
    .filter((r) => r.products)
    .map((r) => ({
      product_id: r.product_id,
      product_name: r.products!.product_name,
      price: Number(r.products!.price),
      delivery_fee: Number(r.products!.delivery_fee),
      form_names: r.form_names ?? [],
      my_price: r.price == null ? null : Number(r.price),
    }));
  return { customer: c ? { name: c.name, crm_links: c.crm_links ?? [] } : null, products };
}

/**
 * What the n8n worker matches leads against for this customer: every Feeder
 * product (item_code = product ID, delivery fee), with the customer's own
 * selling price, and their form names added to the product's other names, so
 * a lead from one of their forms always finds its product.
 */
export async function productsForWorker(userId: string) {
  const db = feederDb();
  const [{ data: all, error }, { data: mine }] = await Promise.all([
    db.from("products").select("product_id, product_name, price, delivery_fee, aliases, active").eq("active", true),
    db.from("customer_products").select("product_id, form_names, price").eq("user_id", userId),
  ]);
  if (error) throw new Error(`Feeder products: ${error.message}`);
  const own = new Map((mine ?? []).map((m) => [m.product_id as number, m as { form_names: string[]; price: number | null }]));
  return (all ?? []).map((p) => {
    const m = own.get(p.product_id);
    return {
      product_id: String(p.product_id),
      product_ID_Feeder: String(p.product_id),
      product_name: p.product_name as string,
      price: String(m?.price ?? p.price),
      delivery_fee: String(p.delivery_fee),
      aliases: [...(m?.form_names ?? []), ...((p.aliases as string[]) ?? [])].join(", "),
      active: "TRUE",
    };
  });
}

/** Set up = their Feeder row exists (made by the setup page, or by saving anything). */
export async function isSetUp(userId: string) {
  const { data } = await feederDb().from("customers").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}
