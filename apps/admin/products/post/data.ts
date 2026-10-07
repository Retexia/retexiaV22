import "server-only";

import { createAdminClient, createAdminSchemaClient } from "@retexia/supabase/admin";

export type PostBusiness = {
  id: string;
  owner_id: string;
  name: string;
  category: string | null;
  country: string;
  timezone: string;
  plan: "trial" | "starter" | "growth" | "pro";
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  settings: { paused?: boolean; auto_publish?: boolean; slots?: string[] } | null;
  onboarding_done: boolean;
  created_at: string;
};
export type PostOverview = {
  accounts_connected: number;
  accounts_reconnect: number;
  tokens_expiring: number;
  posts_upcoming: number;
  published_7d: number;
  failed_7d: number;
  blocked_7d: number;
  needs_manual: number;
  images: number;
  videos: number;
  regenerations: number;
  est_cost_usd: number;
  last_published_at: string | null;
};
export type PostSystem = { generation_paused: boolean; publishing_paused: boolean; note: string | null; updated_at: string | null };
export type PostOwner = { id: string; name: string; email: string | null; orderRef: string | null };

const COLS = "id, owner_id, name, category, country, timezone, plan, subscription_status, settings, onboarding_done, created_at";
const EMPTY: PostOverview = {
  accounts_connected: 0, accounts_reconnect: 0, tokens_expiring: 0, posts_upcoming: 0, published_7d: 0, failed_7d: 0,
  blocked_7d: 0, needs_manual: 0, images: 0, videos: 0, regenerations: 0, est_cost_usd: 0, last_published_at: null,
};
const post = () => createAdminSchemaClient("post");

async function overviewMap() {
  const { data, error } = await post().rpc("admin_overview");
  const map = new Map<string, PostOverview>();
  for (const r of (data ?? []) as (Record<string, unknown> & { business_id: string })[]) {
    const o = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof PostOverview)[]) {
      if (k === "last_published_at") o.last_published_at = (r[k] as string | null) ?? null;
      else o[k] = Number(r[k] ?? 0);
    }
    map.set(r.business_id, o);
  }
  return { map, error: error?.message ?? null };
}

export async function postSystem(): Promise<PostSystem> {
  const { data } = await post().from("system_settings").select("generation_paused, publishing_paused, note, updated_at").eq("id", 1).maybeSingle();
  return (data as PostSystem | null) ?? { generation_paused: false, publishing_paused: false, note: null, updated_at: null };
}

async function owners(ids: string[]) {
  const map = new Map<string, PostOwner>();
  if (!ids.length) return map;
  const db = createAdminClient();
  const [{ data: profiles }, { data: orders }] = await Promise.all([
    db.from("profiles").select("id, full_name, email").in("id", ids),
    db.from("staff_orders").select("user_id, ref, created_at").eq("product_slug", process.env.POST_PRODUCT_SLUG || "post").in("user_id", ids).order("created_at", { ascending: false }),
  ]);
  for (const p of profiles ?? []) {
    map.set(p.id, { id: p.id, name: p.full_name || p.email || "Customer", email: p.email, orderRef: (orders ?? []).find((o) => o.user_id === p.id)?.ref ?? null });
  }
  return map;
}

export async function listPostBusinesses(ownerId?: string) {
  let q = post().from("businesses").select(COLS).order("name");
  if (ownerId) q = q.eq("owner_id", ownerId);
  const [{ data, error }, stats] = await Promise.all([q, overviewMap()]);
  if (error) return { error: error.message, rows: [] };
  const list = (data ?? []) as PostBusiness[];
  const people = await owners([...new Set(list.map((b) => b.owner_id))]);
  return { error: stats.error, rows: list.map((b) => ({ ...b, stats: stats.map.get(b.id) ?? EMPTY, owner: people.get(b.owner_id) ?? null })) };
}

export async function getPostBusiness(id: string) {
  const db = post();
  const [{ data }, stats, accounts, failed, upcoming, events] = await Promise.all([
    db.from("businesses").select(COLS).eq("id", id).maybeSingle(),
    overviewMap(),
    db.from("social_accounts").select("id, platform, display_name, external_id, ig_account_type, enabled, status, token_expires_at").eq("business_id", id).order("platform"),
    db
      .from("publications")
      .select("id, status, attempts, error_kind, last_error, created_at, posts!inner(id, business_id, scheduled_at, format), social_accounts(platform, display_name)")
      .eq("posts.business_id", id)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(10),
    db.from("posts").select("id, scheduled_at, format, status, caption").eq("business_id", id).gte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(9),
    db.from("events").select("id, type, payload, created_at").eq("business_id", id).order("created_at", { ascending: false }).limit(15),
  ]);
  if (!data) return null;
  const business = data as PostBusiness;
  const owner = (await owners([business.owner_id])).get(business.owner_id) ?? null;
  return {
    business,
    owner,
    stats: stats.map.get(id) ?? EMPTY,
    accounts: (accounts.data ?? []) as { id: string; platform: string; display_name: string | null; external_id: string; ig_account_type: string | null; enabled: boolean; status: string; token_expires_at: string | null }[],
    failed: (failed.data ?? []) as unknown as {
      id: string;
      attempts: number;
      error_kind: string | null;
      last_error: string | null;
      created_at: string;
      posts: { id: string; scheduled_at: string; format: string };
      social_accounts: { platform: string; display_name: string | null } | null;
    }[],
    upcoming: (upcoming.data ?? []) as { id: string; scheduled_at: string; format: string; status: string; caption: string | null }[],
    events: (events.data ?? []) as { id: number; type: string; payload: Record<string, unknown>; created_at: string }[],
  };
}
