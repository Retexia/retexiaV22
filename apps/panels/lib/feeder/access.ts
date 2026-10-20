import "server-only";

import { createServerClient } from "@retexia/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ACCESS_STATUSES } from "../customer";
import { webUrl } from "../env";

export const feederSlug = () => process.env.FEEDER_PRODUCT_SLUG || "feeder";

export type FeederPackage = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  /** Bought, and the request is paid (setting up, active or paused). */
  owned: boolean;
  orderRef: string | null;
  orderStatus: string | null;
};

/**
 * Feeder is one panel with several packages: every package is listed, the ones
 * the customer bought are open, the rest are locked. Access is per package,
 * from the customer's own orders (RLS: their own only). Cached per request.
 */
export const getFeeder = cache(async () => {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: product } = await supabase.from("products").select("id, name, page_slug").eq("slug", feederSlug()).maybeSingle();
  const [{ data: profile }, { data: packages }, { data: orders }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", auth.user.id).maybeSingle(),
    product ? supabase.from("packages").select("id, slug, name, tagline, sort_order, is_active, is_visible").eq("product_id", product.id).order("sort_order") : { data: [] },
    product
      ? supabase.from("orders").select("ref, status, package_id, package_name, created_at").eq("product_id", product.id).in("status", ACCESS_STATUSES).order("created_at", { ascending: false })
      : { data: [] },
  ]);
  const bought = new Map<string, { ref: string | null; status: string; name: string | null }>();
  for (const o of orders ?? []) if (!bought.has(o.package_id)) bought.set(o.package_id, { ref: o.ref, status: o.status, name: o.package_name });

  // Every package on sale, plus any the customer owns that is no longer on sale.
  const list: FeederPackage[] = (packages ?? [])
    .filter((p) => (p.is_active && p.is_visible) || bought.has(p.id))
    .map((p) => {
      const o = bought.get(p.id);
      return { id: p.id, slug: p.slug, name: p.name, tagline: p.tagline, owned: Boolean(o), orderRef: o?.ref ?? null, orderStatus: o?.status ?? null };
    });
  return {
    user: { id: auth.user.id, email: profile?.email ?? auth.user.email ?? "", name: profile?.full_name ?? "" },
    productName: product?.name ?? "Retexia Feeder",
    /** Where a locked package is bought on retexia.com. */
    buyUrl: (slug: string) => `${webUrl()}/${product?.page_slug || feederSlug()}/get-started?package=${encodeURIComponent(slug)}`,
    packages: list,
  };
});

/** For pages: signed in and owns at least one Feeder package, or redirect. */
export async function requireFeederPage(path = "/") {
  const feeder = await getFeeder();
  if (!feeder) redirect(`/auth/start?next=${encodeURIComponent(path)}`);
  if (!feeder.packages.some((p) => p.owned)) redirect("/no-access");
  return feeder;
}
