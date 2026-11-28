import "server-only";

import { metaCheck } from "./autopublish/meta";
import { feederDb } from "./db";
import { asSeller, forgetToken, graph, sellerToken } from "./meta-connection";

/**
 * A seller's Business portfolio: what their token reaches, kept only when the
 * portfolio itself owns it, and what each tool can do with it.
 */

/** What each tool needs from the token. */
export const NEEDS = {
  autopublish: ["ads_management", "pages_show_list", "pages_manage_ads", "pages_read_engagement", "leads_retrieval"],
  comments: ["pages_read_engagement", "pages_read_user_content", "pages_manage_engagement"],
  /** Nice to have: private replies to commenters. */
  comments_optional: ["pages_messaging"],
} as const;

const ACCOUNT_STATUS: Record<number, string> = {
  1: "",
  2: "This ad account is disabled by Meta.",
  3: "This ad account has an unpaid balance. Pay it in Ads Manager.",
  7: "Meta is reviewing this ad account (pending risk review).",
  8: "This ad account is waiting for a payment to settle.",
  9: "This ad account is in a grace period: add a payment method in Ads Manager.",
  100: "This ad account is pending closure.",
  101: "This ad account is closed.",
};

export type FoundAd = { id: string; name: string; currency: string | null; timezone: string | null; status: number; problem: string | null };
export type FoundPage = { id: string; name: string; instagram: { id: string; username: string | null } | null };
export type Discovery = {
  ok: boolean;
  problem: string | null;
  business_name: string | null;
  token_user: string | null;
  scopes: string[];
  scopesKnown: boolean;
  adAccounts: FoundAd[];
  pages: FoundPage[];
  /** Assets the token reaches that belong to another portfolio (left out). */
  elsewhere: { adAccounts: number; pages: number };
};

type Biz = { id?: string; name?: string } | undefined;
const list = <T,>(body: unknown): T[] => ((body as { data?: T[] } | null)?.data ?? []) as T[];
const errMsg = (body: unknown) => String((body as { error?: { message?: string } } | null)?.error?.message ?? "Facebook said no").slice(0, 300).replace(/\.+$/, "");

/** Looks the portfolio up with this token (nothing is saved here). */
export async function discover(token: string, businessId: string): Promise<Discovery> {
  const empty: Discovery = { ok: false, problem: null, business_name: null, token_user: null, scopes: [], scopesKnown: false, adAccounts: [], pages: [], elsewhere: { adAccounts: 0, pages: 0 } };
  const me = await graph(token, "GET", "me", { fields: "id,name" }, 30_000);
  if (!me.ok) {
    return { ...empty, problem: me.network ? "Retexia couldn't reach Facebook just now. Try again in a minute." : `Facebook didn't accept this token: ${errMsg(me.body)}. Generate a new System User token and paste it again.` };
  }
  const [perms, biz, ads, pages, ownedPages, ownedAds] = await Promise.all([
    graph(token, "GET", "me/permissions", { limit: 200 }, 30_000),
    graph(token, "GET", businessId, { fields: "id,name" }, 30_000),
    graph(token, "GET", "me/adaccounts", { fields: "id,account_id,name,currency,timezone_name,account_status,business{id,name}", limit: 200 }, 60_000),
    graph(token, "GET", "me/accounts", { fields: "id,name,business{id,name},instagram_business_account{id,username}", limit: 200 }, 60_000),
    graph(token, "GET", `${businessId}/owned_pages`, { fields: "id,name,instagram_business_account{id,username}", limit: 200 }, 60_000),
    graph(token, "GET", `${businessId}/owned_ad_accounts`, { fields: "id,account_id,name,currency,timezone_name,account_status", limit: 200 }, 60_000),
  ]);
  const scopes = perms.ok ? list<{ permission: string; status: string }>(perms.body).filter((p) => p.status === "granted").map((p) => p.permission) : [];

  // Ad accounts: owned by this portfolio.
  const ownedAdIds = new Set(ownedAds.ok ? list<{ account_id: string }>(ownedAds.body).map((a) => String(a.account_id)) : []);
  type RawAd = { account_id: string; name?: string; currency?: string; timezone_name?: string; account_status?: number; business?: Biz };
  const rawAds = new Map<string, RawAd>();
  for (const a of [...list<RawAd>(ads.body), ...(ownedAds.ok ? list<RawAd>(ownedAds.body) : [])]) if (a?.account_id) rawAds.set(String(a.account_id), { ...rawAds.get(String(a.account_id)), ...a });
  const adAccounts: FoundAd[] = [];
  let adsElsewhere = 0;
  for (const a of rawAds.values()) {
    const mine = a.business?.id ? a.business.id === businessId : ownedAdIds.has(String(a.account_id));
    if (!mine) {
      adsElsewhere++;
      continue;
    }
    const status = Number(a.account_status ?? 1);
    adAccounts.push({ id: String(a.account_id), name: a.name ?? `Ad account ${a.account_id}`, currency: a.currency ?? null, timezone: a.timezone_name ?? null, status, problem: (ACCOUNT_STATUS[status] ?? `This ad account isn't active (Meta status ${status}).`) || null });
  }

  // Pages: owned by this portfolio.
  const ownedPageIds = new Set(ownedPages.ok ? list<{ id: string }>(ownedPages.body).map((p) => String(p.id)) : []);
  type RawPage = { id: string; name?: string; business?: Biz; instagram_business_account?: { id: string; username?: string } };
  const rawPages = new Map<string, RawPage>();
  for (const p of [...list<RawPage>(pages.body), ...(ownedPages.ok ? list<RawPage>(ownedPages.body) : [])]) if (p?.id) rawPages.set(String(p.id), { ...rawPages.get(String(p.id)), ...p });
  const found: FoundPage[] = [];
  let pagesElsewhere = 0;
  for (const p of rawPages.values()) {
    const mine = p.business?.id ? p.business.id === businessId : ownedPageIds.has(String(p.id));
    if (!mine) {
      pagesElsewhere++;
      continue;
    }
    found.push({ id: String(p.id), name: p.name ?? `Page ${p.id}`, instagram: p.instagram_business_account?.id ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username ?? null } : null });
  }

  const bizName = biz.ok ? String((biz.body as { name?: string }).name ?? "") || null : null;
  let problem: string | null = null;
  if (!adAccounts.length && !found.length) {
    problem = rawAds.size || rawPages.size
      ? `This token reaches ${rawAds.size} ad account(s) and ${rawPages.size} Page(s), but none belong to portfolio ${businessId}. Check the Business portfolio ID, or give the System User access to your portfolio's assets.`
      : "This token doesn't reach any ad account or Page yet. In Business settings → System users → Assign assets, give it your ad accounts and Pages, then generate the token again.";
  }
  return {
    ok: !problem,
    problem,
    business_name: bizName,
    token_user: String((me.body as { name?: string }).name ?? "") || null,
    scopes,
    scopesKnown: perms.ok,
    adAccounts: adAccounts.sort((a, b) => a.name.localeCompare(b.name)),
    pages: found.sort((a, b) => a.name.localeCompare(b.name)),
    elsewhere: { adAccounts: adsElsewhere, pages: pagesElsewhere },
  };
}

/** Which of a tool's permissions the token is missing ([] = all there, or unknown). */
export function missing(scopes: string[], known: boolean, needs: readonly string[]) {
  return known ? needs.filter((n) => !scopes.includes(n)) : [];
}

/** Saves what Facebook said: the connection, the assets (keeping the seller's choices), then Autopublish's settings. */
export async function saveDiscovery(userId: string, d: Discovery) {
  const db = feederDb();
  const now = new Date().toISOString();
  await db
    .from("meta_connections")
    .update({ business_name: d.business_name, token_user: d.token_user, scopes: d.scopes, status: d.ok ? "connected" : "problem", problem: d.problem, checked_at: now, updated_at: now })
    .eq("user_id", userId);
  if (!d.ok && !d.adAccounts.length && !d.pages.length) return;

  const { data: before } = await db.from("meta_assets").select("kind, asset_id, for_autopublish, for_comments, is_default").eq("user_id", userId);
  const prev = new Map((before ?? []).map((a) => [`${a.kind}:${a.asset_id}`, a]));
  const rows = [
    ...d.adAccounts.map((a) => ({ kind: "ad_account", asset_id: a.id, name: a.name, info: { currency: a.currency, timezone: a.timezone, account_status: a.status }, status: a.problem ? "problem" : "ok", problem: a.problem })),
    ...d.pages.map((p) => ({ kind: "page", asset_id: p.id, name: p.name, info: { instagram: p.instagram }, status: "ok", problem: null })),
  ].map((r) => {
    const old = prev.get(`${r.kind}:${r.asset_id}`);
    return { user_id: userId, ...r, for_autopublish: old?.for_autopublish ?? false, for_comments: old?.for_comments ?? false, is_default: old?.is_default ?? false, checked_at: now };
  });
  // The first time: the first active ad account and the first Page are the defaults; the first Page answers comments.
  const ads = rows.filter((r) => r.kind === "ad_account");
  const pgs = rows.filter((r) => r.kind === "page");
  if (ads.length && !ads.some((r) => r.is_default)) {
    const first = ads.find((r) => r.status === "ok") ?? ads[0]!;
    first.is_default = true;
    first.for_autopublish = true;
  }
  if (pgs.length && !pgs.some((r) => r.is_default)) pgs[0]!.is_default = true;
  if (pgs.length && !(before ?? []).length) pgs[0]!.for_comments = true;
  const { error } = await db.from("meta_assets").upsert(rows, { onConflict: "user_id,kind,asset_id" });
  if (error) {
    // Another Retexia account already answers this Page's comments: keep it off here.
    if (error.code === "23505") await db.from("meta_assets").upsert(rows.map((r) => ({ ...r, for_comments: false })), { onConflict: "user_id,kind,asset_id" });
    else throw new Error(`meta assets: ${error.message}`);
  }
  // Assets no longer reached are marked gone (and can't be used).
  const keep = new Set(rows.map((r) => `${r.kind}:${r.asset_id}`));
  const gone = (before ?? []).filter((a) => !keep.has(`${a.kind}:${a.asset_id}`));
  for (const g of gone) {
    await db.from("meta_assets").update({ status: "gone", problem: "Your token doesn't reach it any more.", for_autopublish: false, for_comments: false, is_default: false }).eq("user_id", userId).eq("kind", g.kind).eq("asset_id", g.asset_id);
  }
  await syncAutopublish(userId);
}

/** Autopublish's settings row follows the seller's choices: default ad account, ads Page, connected when everything checks out. */
export async function syncAutopublish(userId: string) {
  const db = feederDb();
  const [{ data: conn }, { data: assets }, { data: acc }] = await Promise.all([
    db.from("meta_connections").select("scopes, status, business_name").eq("user_id", userId).maybeSingle(),
    db.from("meta_assets").select("*").eq("user_id", userId),
    db.from("ad_accounts").select("user_id, meta_pixel_id, privacy_policy_url").eq("user_id", userId).maybeSingle(),
  ]);
  if (!conn) return;
  const ad = (assets ?? []).find((a) => a.kind === "ad_account" && a.is_default && a.for_autopublish);
  const page = (assets ?? []).find((a) => a.kind === "page" && a.is_default);
  const lacks = missing(conn.scopes ?? [], (conn.scopes ?? []).length > 0, NEEDS.autopublish);
  const ig = (page?.info as { instagram?: { id: string } | null } | undefined)?.instagram ?? null;
  const info = (ad?.info ?? {}) as { currency?: string | null; timezone?: string | null };
  const ready = conn.status === "connected" && ad && ad.status === "ok" && page && !lacks.length;
  const patch: Record<string, unknown> = {
    user_id: userId,
    meta_via: "token",
    meta_ad_account_id: ad?.asset_id ?? null,
    meta_page_id: page?.asset_id ?? null,
    meta_instagram_id: ig?.id ?? null,
    meta_status: !ad ? "none" : ready ? "connected" : "problem",
  };
  if (info.currency && /^[A-Z]{3}$/.test(info.currency)) patch.currency = info.currency;
  if (info.timezone) patch.timezone = info.timezone;
  const { error } = await db.from("ad_accounts").upsert(patch, { onConflict: "user_id" });
  if (error) throw new Error(error.code === "23505" ? "This ad account is already used by another Retexia account." : `ad account: ${error.message}`);
  // Instant Forms, Pixel, Instagram: the same check as before, now with the seller's token.
  if (ad && page) {
    const r = await asSeller(userId, () => metaCheck({ meta_ad_account_id: ad.asset_id, meta_page_id: page.asset_id, meta_instagram_id: ig?.id ?? null, meta_pixel_id: (acc?.meta_pixel_id as string | null) ?? null }, "token"));
    const problems = [...((r.info as { problems?: string[] }).problems ?? []), ...(lacks.length ? [`Your token is missing these permissions for Autopublish: ${lacks.join(", ")}.`] : [])];
    await db.from("ad_accounts").update({ meta_info: { ...r.info, problems, business_name: conn.business_name }, meta_status: ready && r.ok ? "connected" : "problem" }).eq("user_id", userId);
  }
}

/** "Check again": the same lookup with the saved token. */
export async function refresh(userId: string) {
  forgetToken(userId);
  const conn = await sellerToken(userId);
  if (!conn) return null;
  const d = await discover(conn.token, conn.business_id);
  await saveDiscovery(userId, d);
  return d;
}
