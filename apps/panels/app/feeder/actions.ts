"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, dbMessage, run, type ActionResult } from "@/lib/action";
import { getFeeder } from "@/lib/feeder/access";
import { feederDb } from "@/lib/feeder/db";

const SHEET = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/(e\/)?[\w-]{20,}/;
const MAX_LINKS = 20;

/** The signed-in customer with at least one Feeder package. */
async function feederUser() {
  const feeder = await getFeeder();
  if (!feeder) throw new AccessError("Please sign in again.");
  if (!feeder.packages.some((p) => p.owned)) throw new AccessError("Feeder isn't active on this account.");
  return feeder.user;
}

/** Their Feeder row, created on first use (name from their Retexia account). */
async function ensureCustomer(user: { id: string; name: string }) {
  const db = feederDb();
  const { data } = await db.from("customers").select("name, crm_links").eq("user_id", user.id).maybeSingle();
  if (data) return data as { name: string | null; crm_links: string[] };
  const { error } = await db.from("customers").insert({ user_id: user.id, name: user.name || null });
  if (error) throw new Error(error.message);
  return { name: user.name || null, crm_links: [] as string[] };
}

const done = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

const productInput = z.object({
  product_id: z.number().int().positive(),
  form_names: z.array(z.string().trim().min(1).max(120)).max(30),
  price: z.number().min(0).max(10_000_000).nullable(),
});

/** Add or change one of their products: its form names and their own selling price. */
export async function saveMyProduct(input: z.input<typeof productInput>): Promise<ActionResult> {
  return run(async () => {
    const user = await feederUser();
    const d = productInput.parse(input);
    const db = feederDb();
    const { data: product } = await db.from("products").select("product_id, product_name").eq("product_id", d.product_id).eq("active", true).maybeSingle();
    if (!product) return { ok: false, message: "That product isn't in the Feeder list." };
    // One form name, one product (the same form can't mean two products).
    const names = [...new Map(d.form_names.map((n) => [n.toLowerCase(), n])).values()];
    await ensureCustomer(user);
    const { data: others } = await db.from("customer_products").select("product_id, form_names, products(product_name)").eq("user_id", user.id).neq("product_id", d.product_id);
    for (const o of (others ?? []) as unknown as { form_names: string[]; products: { product_name: string } | null }[]) {
      const clash = names.find((n) => (o.form_names ?? []).some((x) => x.toLowerCase() === n.toLowerCase()));
      if (clash) return { ok: false, message: `"${clash}" is already a form name of ${o.products?.product_name ?? "another product"}. Remove it there first.`, fieldErrors: { form_names: "Already used" } };
    }
    const { error } = await db
      .from("customer_products")
      .upsert({ user_id: user.id, product_id: d.product_id, form_names: names, price: d.price, updated_at: new Date().toISOString() }, { onConflict: "user_id,product_id" });
    if (error) return { ok: false, message: dbMessage(error) };
    return done(`${product.product_name} saved`);
  });
}

export async function removeMyProduct(input: { product_id: number }): Promise<ActionResult> {
  return run(async () => {
    const user = await feederUser();
    const id = z.number().int().positive().parse(input.product_id);
    const { error } = await feederDb().from("customer_products").delete().eq("user_id", user.id).eq("product_id", id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Product removed");
  });
}

export async function saveFeederName(input: { name: string }): Promise<ActionResult> {
  return run(async () => {
    const user = await feederUser();
    const name = z.string().trim().min(1, "Enter your name or shop name").max(120).parse(input.name);
    await ensureCustomer(user);
    const { error } = await feederDb().from("customers").update({ name, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Saved");
  });
}

/** Saves a CRM Google Sheet link (view access) to their account. */
export async function addCrmLink(input: { link: string }): Promise<ActionResult> {
  return run(async () => {
    const user = await feederUser();
    const link = z.string().trim().max(500).regex(SHEET, "Paste a Google Sheet link (docs.google.com/spreadsheets/…)").parse(input.link);
    const c = await ensureCustomer(user);
    const links = c.crm_links ?? [];
    if (links.includes(link)) return { ok: false, message: "This link is already saved." };
    if (links.length >= MAX_LINKS) return { ok: false, message: `Up to ${MAX_LINKS} CRM links. Remove one first.` };
    const { error } = await feederDb().from("customers").update({ crm_links: [...links, link], updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("CRM link saved");
  });
}

export async function removeCrmLink(input: { link: string }): Promise<ActionResult> {
  return run(async () => {
    const user = await feederUser();
    const link = z.string().max(500).parse(input.link);
    const c = await ensureCustomer(user);
    const { error } = await feederDb()
      .from("customers")
      .update({ crm_links: (c.crm_links ?? []).filter((l) => l !== link), updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("CRM link removed");
  });
}

/** Setup finished (or skipped): their Feeder row exists, so the panel opens normally. */
export async function finishFeederSetup(): Promise<ActionResult> {
  return run(async () => {
    const user = await feederUser();
    await ensureCustomer(user);
    return done("You're all set");
  });
}
