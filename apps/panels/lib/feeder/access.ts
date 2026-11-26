import "server-only";

import type { Database } from "@retexia/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ACCESS_STATUSES, actingUser, opensPanel } from "../customer";
import { webUrl } from "../env";
import { toolFor } from "./tools";

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
  /** Free trial end (only while the package is on a trial). */
  trialEndsAt: string | null;
  /** Free for every Retexia account (no price, no setup fee): open without an order. */
  free: boolean;
};

/**
 * Feeder is one panel with several packages: every package is listed, the ones
 * the customer bought are open, the rest are locked. Access is per package,
 * from the customer's own orders (RLS: their own only). Cached per request.
 */
export const getFeeder = cache(async () => {
  // The customer's own session (RLS), or the customer a Retexia admin opened in support mode.
  const { userId, email, sb } = await actingUser();
  if (!userId) return null;
  return loadFeeder(sb, userId, email);
});

/**
 * The same as getFeeder() for any Supabase client that acts as the person (their cookie session in
 * the panels, their access token in the app's /api/app routes). One rule for both.
 */
export async function loadFeeder(supabase: SupabaseClient<Database>, userId: string, email: string | null) {
  const { data: product } = await supabase.from("products").select("id, name, page_slug").eq("slug", feederSlug()).maybeSingle();
  const [{ data: profile }, { data: packages }, { data: orders }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    product ? supabase.from("packages").select("id, slug, name, tagline, sort_order, is_active, is_visible, price_monthly, price_yearly, setup_fee").eq("product_id", product.id).order("sort_order") : { data: [] },
    product
      ? supabase.from("orders").select("ref, status, package_id, package_name, created_at, trial_ends_at").eq("user_id", userId).eq("product_id", product.id).in("status", ACCESS_STATUSES).order("created_at", { ascending: false })
      : { data: [] },
  ]);
  const bought = new Map<string, { ref: string | null; status: string; name: string | null; trialEndsAt: string | null }>();
  for (const o of (orders ?? []).filter(opensPanel)) {
    if (!bought.has(o.package_id)) bought.set(o.package_id, { ref: o.ref, status: o.status, name: o.package_name, trialEndsAt: o.status === "trial" ? o.trial_ends_at : null });
  }

  // Every package on sale, plus any the customer owns that is no longer on sale.
  const list: FeederPackage[] = (packages ?? [])
    .filter((p) => (p.is_active && p.is_visible) || bought.has(p.id))
    .map((p) => {
      const o = bought.get(p.id);
      const free = p.is_active && Number(p.price_monthly) === 0 && !Number(p.price_yearly ?? 0) && Number(p.setup_fee) === 0;
      return { id: p.id, slug: p.slug, name: p.name, tagline: p.tagline, owned: Boolean(o) || free, orderRef: o?.ref ?? null, orderStatus: o?.status ?? (free ? "free" : null), trialEndsAt: o?.trialEndsAt ?? null, free };
    });
  // Bulk create v2 does everything the older Bulk import did: owners of either don't see the other offered.
  const isBulk = (slug: string) => toolFor(slug) === "bulk-import-v2";
  const hasBulk = list.some((p) => p.owned && isBulk(p.slug));
  const shown = hasBulk ? list.filter((p) => p.owned || !isBulk(p.slug)) : list;
  return {
    user: { id: userId, email: profile?.email ?? email ?? "", name: profile?.full_name ?? "" },
    productName: product?.name ?? "Retexia Feeder",
    /** Where a locked package is bought on retexia.com (web panel only: the app never links to it). */
    buyUrl: (slug: string) => `${webUrl()}/${product?.page_slug || feederSlug()}/get-started?package=${encodeURIComponent(slug)}`,
    packages: shown,
  };
}
export type Feeder = Awaited<ReturnType<typeof loadFeeder>>;

/** For pages: signed in and owns at least one Feeder package, or redirect. */
export async function requireFeederPage(path = "/") {
  const feeder = await getFeeder();
  if (!feeder) redirect(`/auth/start?next=${encodeURIComponent(path)}`);
  if (!feeder.packages.some((p) => p.owned)) redirect("/no-access");
  return feeder;
}
