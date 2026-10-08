"use server";

import { createAdminClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { PADDLE_CURRENCIES, paddleApi, paddleConfigured, toMinor } from "@/lib/paddle";

type PriceBody = {
  description: string;
  name: string;
  unit_price: { amount: string; currency_code: string };
  billing_cycle?: { interval: "month" | "year"; frequency: 1 } | null;
  quantity: { minimum: 1; maximum: 1 };
  custom_data: Record<string, string>;
};

/** Creates or updates one Paddle price; archives it when the package no longer has that price. */
async function ensurePrice(productId: string, existing: string | null, body: PriceBody | null): Promise<{ id: string | null; error?: string }> {
  if (!body) {
    if (existing) await paddleApi(`/prices/${existing}`, { method: "PATCH", body: { status: "archived" } });
    return { id: null };
  }
  if (existing) {
    const r = await paddleApi<{ id: string }>(`/prices/${existing}`, {
      method: "PATCH",
      body: { description: body.description, name: body.name, unit_price: body.unit_price, custom_data: body.custom_data, status: "active" },
    });
    if (r.ok) return { id: existing };
    if (r.code !== "entity_not_found" && r.code !== "not_found") return { id: existing, error: r.error };
  }
  const r = await paddleApi<{ id: string }>("/prices", { method: "POST", body: { product_id: productId, ...body } });
  return r.ok ? { id: r.data.id } : { id: null, error: r.error };
}

/**
 * "Sync plans to Paddle": every orderable product becomes a Paddle product,
 * every package a monthly price, a yearly price and (if any) a one-time
 * setup fee price. Run it again after changing prices.
 */
export async function syncPaddleCatalog(): Promise<ActionResult<string[]>> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    if (!paddleConfigured()) return { ok: false, message: "Set PADDLE_API_KEY in the admin's environment first." };
    const db = createAdminClient();
    const [{ data: settings }, { data: products }] = await Promise.all([
      db.from("site_settings").select("currency_code").eq("id", 1).single(),
      db.from("products").select("id, slug, name, tagline, status, paddle_product_id").neq("status", "hidden").order("sort_order"),
    ]);
    const lines: string[] = [];
    for (const p of products ?? []) {
      const { data: packages } = await db
        .from("packages")
        .select("id, slug, name, price_monthly, price_yearly, setup_fee, currency, is_active, paddle_price_monthly, paddle_price_yearly, paddle_price_setup")
        .eq("product_id", p.id)
        .order("sort_order");
      if (!packages?.length) continue;

      let productId = p.paddle_product_id;
      const productBody = { name: p.name, description: p.tagline ?? undefined, custom_data: { retexia_slug: p.slug } };
      if (productId) {
        const r = await paddleApi(`/products/${productId}`, { method: "PATCH", body: { ...productBody, status: "active" } });
        if (!r.ok) productId = null;
      }
      if (!productId) {
        let r = await paddleApi<{ id: string }>("/products", { method: "POST", body: { ...productBody, tax_category: "saas" } });
        if (!r.ok) r = await paddleApi<{ id: string }>("/products", { method: "POST", body: { ...productBody, tax_category: "standard" } });
        if (!r.ok) {
          lines.push(`${p.name}: ${r.error}`);
          continue;
        }
        productId = r.data.id;
        await db.from("products").update({ paddle_product_id: productId }).eq("id", p.id);
      }

      for (const pkg of packages) {
        const currency = (pkg.currency || settings?.currency_code || "USD").toUpperCase();
        if (!PADDLE_CURRENCIES.has(currency)) {
          lines.push(`${pkg.name}: Paddle can't charge in ${currency}. Set prices in USD (Settings → General → currency).`);
          continue;
        }
        const price = (amount: number | null, cycle: "month" | "year" | null, label: string, kind: string): PriceBody | null =>
          amount === null || amount <= 0 || !pkg.is_active
            ? null
            : {
                name: `${pkg.name} (${label})`,
                description: `${p.name} · ${pkg.name} · ${label}`,
                unit_price: { amount: toMinor(Number(amount), currency), currency_code: currency },
                billing_cycle: cycle ? { interval: cycle, frequency: 1 } : null,
                quantity: { minimum: 1, maximum: 1 },
                custom_data: { package_id: pkg.id, kind },
              };
        const [m, y, s] = await Promise.all([
          ensurePrice(productId, pkg.paddle_price_monthly, price(Number(pkg.price_monthly), "month", "monthly", "monthly")),
          ensurePrice(productId, pkg.paddle_price_yearly, price(pkg.price_yearly === null ? null : Number(pkg.price_yearly), "year", "yearly", "yearly")),
          ensurePrice(productId, pkg.paddle_price_setup, price(Number(pkg.setup_fee ?? 0), null, "one-time setup", "setup")),
        ]);
        await db.from("packages").update({ paddle_price_monthly: m.id, paddle_price_yearly: y.id, paddle_price_setup: s.id }).eq("id", pkg.id);
        const errors = [m.error, y.error, s.error].filter(Boolean);
        lines.push(errors.length ? `${pkg.name}: ${errors.join("; ")}` : `${pkg.name}: ${[m.id && "monthly", y.id && "yearly", s.id && "setup fee"].filter(Boolean).join(", ")} ✓`);
      }
    }
    await audit(staff, { action: "paddle.sync", table: "packages", summary: `Synced plans to Paddle: ${lines.join(" | ").slice(0, 900)}` });
    revalidatePath("/settings/payments");
    revalidatePath("/products", "layout");
    const failed = lines.filter((l) => !l.endsWith("✓"));
    return failed.length ? { ok: false, message: failed.join(" · ") } : { ok: true, message: `${lines.length} plans are in Paddle.`, data: lines };
  });
}

/** Cancel a request's Paddle subscription (at the end of the paid period, or now). */
export async function cancelPaddleSubscription(input: { orderId: string; when: "next_billing_period" | "immediately" }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const d = z.object({ orderId: z.uuid(), when: z.enum(["next_billing_period", "immediately"]) }).parse(input);
    const { data: order } = await createAdminClient().from("orders").select("ref, paddle_subscription_id").eq("id", d.orderId).maybeSingle();
    if (!order?.paddle_subscription_id) return { ok: false, message: "This request has no Paddle subscription." };
    const r = await paddleApi(`/subscriptions/${order.paddle_subscription_id}/cancel`, { method: "POST", body: { effective_from: d.when } });
    if (!r.ok) return { ok: false, message: `Paddle: ${r.error}` };
    await audit(staff, { action: "paddle.cancel", table: "orders", recordId: d.orderId, summary: `Cancelled the Paddle subscription of ${order.ref} (${d.when.replace(/_/g, " ")})` });
    revalidatePath(`/requests/${encodeURIComponent(order.ref ?? "")}`);
    return {
      ok: true,
      message: d.when === "immediately" ? "Cancelled. The request is cancelled as soon as Paddle confirms." : "Cancels at the end of the paid period. The request is cancelled then.",
    };
  });
}
