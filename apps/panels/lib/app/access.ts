import "server-only";

import type { AppProduct, AppProductKey } from "@retexia/shared/app-api";
import { loadCustomer } from "../customer";
import { loadFeeder } from "../feeder/access";
import { lfDb } from "../feeder/lingo-feeder/db";
import { LINGO_FEEDER_SLUG } from "../feeder/lingo-feeder/data";
import { HttpError } from "./http";
import type { AppUser } from "./auth";

/**
 * What the person can open in the app: the SAME access rule as the panels (loadCustomer /
 * loadFeeder → an order in setting_up · active · paused · trial before trial_ends_at, plus free
 * packages; Plan is free for every account). The app is consumption-only, so nothing here has a
 * price or a link to buy: a product or package that isn't on the account is just `open: false`.
 */
/** Packages and products with native screens in this version of the app. */
const IN_APP = new Set<string>(["lingo-feeder"]);

const slugs: Record<AppProductKey, () => string> = {
  lingo: () => process.env.LINGO_PRODUCT_SLUG || "lingo",
  post: () => process.env.POST_PRODUCT_SLUG || "post",
  feeder: () => process.env.FEEDER_PRODUCT_SLUG || "feeder",
  plan: () => "plan",
};

export async function appProducts(user: AppUser): Promise<AppProduct[]> {
  const keys = Object.keys(slugs) as AppProductKey[];
  const { data: rows } = await user.sb
    .from("products")
    .select("slug, name, short_name, icon, color_light, color_dark, color_soft_light, color_soft_dark, status, sort_order")
    .in("slug", keys.map((k) => slugs[k]()));
  const [lingo, post, feeder] = await Promise.all([
    loadCustomer(user.sb, user.id, user.email, slugs.lingo()),
    loadCustomer(user.sb, user.id, user.email, slugs.post()),
    loadFeeder(user.sb, user.id, user.email),
  ]);
  const out: AppProduct[] = [];
  for (const key of keys) {
    const p = (rows ?? []).find((r) => r.slug === slugs[key]());
    if (!p) continue;
    const base = {
      key, slug: p.slug, name: p.name, shortName: p.short_name, icon: p.icon,
      colors: { light: p.color_light, dark: p.color_dark, softLight: p.color_soft_light, softDark: p.color_soft_dark },
    };
    if (key === "feeder") {
      const packages = feeder.packages.map((k) => ({
        slug: k.slug, name: k.name, open: k.owned, inApp: IN_APP.has(k.slug), status: k.orderStatus, trialEndsAt: k.trialEndsAt,
      }));
      out.push({ ...base, open: packages.some((k) => k.open), status: null, trialEndsAt: null, packages });
    } else if (key === "plan") {
      out.push({ ...base, open: true, status: "free", trialEndsAt: null, packages: [] });
    } else {
      const c = key === "lingo" ? lingo : post;
      out.push({ ...base, open: Boolean(c.order), status: c.order?.status ?? null, trialEndsAt: null, packages: [] });
    }
  }
  return out.sort((a, b) => Number(b.open) - Number(a.open));
}

/** For Lingo Feeder routes: the person has Lingo Feeder → their seller id (made on first use), or 403. */
export async function appLingoFeeder(user: AppUser): Promise<{ userId: string; name: string }> {
  const feeder = await loadFeeder(user.sb, user.id, user.email);
  if (!feeder.packages.some((p) => p.slug === LINGO_FEEDER_SLUG && p.owned)) {
    throw new HttpError(403, "Lingo Feeder isn't on your account.");
  }
  const { error } = await lfDb().rpc("ensure_seller", { p_user: user.id, p_name: feeder.user.name || null });
  if (error) throw new Error(`Lingo Feeder seller: ${error.message}`);
  return { userId: user.id, name: feeder.user.name };
}

/** Unread app notifications: pushes since they last opened the Inbox. */
export async function unreadCount(user: AppUser): Promise<number> {
  const { data: prefs } = await user.sb.from("notification_prefs").select("inbox_seen_at").eq("user_id", user.id).maybeSingle();
  let q = user.sb.from("notifications_outbox").select("id", { count: "exact", head: true }).eq("channel", "push").eq("user_id", user.id);
  if (prefs?.inbox_seen_at) q = q.gt("created_at", prefs.inbox_seen_at);
  const { count } = await q;
  return count ?? 0;
}
