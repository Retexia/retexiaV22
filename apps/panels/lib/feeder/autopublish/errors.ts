import "server-only";

import { feederDb } from "../db";
import type { GatewayReply } from "./gateway";
import type { Platform } from "./plan";

/**
 * SW-ClassifyError: a platform error → category, what to do and a plain
 * message, from feeder.ad_error_catalog (seeded in 0036, editable by Retexia).
 * Unknown errors become a draft catalog row for Retexia to fill in.
 */
export type Category = "TRANSIENT" | "RATE_LIMIT" | "AUTH" | "PERMISSION" | "ACCOUNT" | "BILLING" | "VALIDATION" | "CREATIVE" | "POLICY" | "LIMIT" | "UNKNOWN";
export type ErrorAction = "retry" | "wait_rate_limit" | "needs_client" | "needs_admin" | `auto_fix:${string}`;

export type Classified = {
  category: Category;
  action: ErrorAction;
  /** Shown to the customer (never the raw API text alone). */
  message: string;
  fix_field: string | null;
  code: string | null;
  /** When to try again (rate limits). */
  retryAt: Date | null;
  detail: Record<string, unknown>;
};

type CatalogRow = {
  id: number;
  platform: string;
  code: string | null;
  subcode: string | null;
  match_regex: string | null;
  category: Category;
  action: ErrorAction;
  client_message: string | null;
  fix_field: string | null;
  is_draft: boolean;
  sort: number;
};

let cache: { at: number; rows: CatalogRow[] } | null = null;
async function catalog(): Promise<CatalogRow[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.rows;
  const { data, error } = await feederDb().from("ad_error_catalog").select("id, platform, code, subcode, match_regex, category, action, client_message, fix_field, is_draft, sort").eq("is_draft", false).order("sort");
  if (error) console.error("[autopublish] error catalog:", error.message);
  cache = { at: Date.now(), rows: (data ?? []) as CatalogRow[] };
  return cache.rows;
}

const SAFE_PLATFORM_TEXT = 300;

/** The platform's own error, normalised. */
export function readError(platform: Platform, r: GatewayReply) {
  const b = r.body && typeof r.body === "object" ? r.body : {};
  if (platform === "meta" || r.network) {
    const e = (b.error ?? {}) as Record<string, unknown>;
    return {
      code: e.code != null ? String(e.code) : r.network ? "gateway" : r.status ? `http_${r.status}` : null,
      subcode: e.error_subcode != null ? String(e.error_subcode) : null,
      message: String(e.message ?? (r.network ? "gateway" : "")).slice(0, SAFE_PLATFORM_TEXT),
      user_title: e.error_user_title ? String(e.error_user_title).slice(0, 200) : null,
      user_msg: e.error_user_msg ? String(e.error_user_msg).slice(0, SAFE_PLATFORM_TEXT) : null,
      trace: e.fbtrace_id ? String(e.fbtrace_id) : null,
    };
  }
  return {
    code: b.code != null ? String(b.code) : r.status ? `http_${r.status}` : null,
    subcode: null,
    message: String(b.message ?? "").slice(0, SAFE_PLATFORM_TEXT),
    user_title: null,
    user_msg: null,
    trace: b.request_id ? String(b.request_id) : null,
  };
}

const test = (pattern: string, values: (string | null)[]) => {
  try {
    const re = new RegExp(pattern, "i");
    return values.some((v) => v != null && re.test(v));
  } catch {
    return false;
  }
};

/** Meta's rate-limit headers → when the account can call again (minutes from now, at least 1). */
function retryFromUsage(usage: Record<string, string> | undefined): Date {
  let minutes = 5;
  for (const v of Object.values(usage ?? {})) {
    try {
      const parsed = JSON.parse(v) as unknown;
      const walk = (x: unknown) => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === "object") {
          for (const [k, val] of Object.entries(x)) {
            if (k === "estimated_time_to_regain_access" && typeof val === "number" && val > 0) minutes = Math.max(minutes, val);
            else walk(val);
          }
        }
      };
      walk(parsed);
    } catch {
      /* not JSON */
    }
  }
  return new Date(Date.now() + Math.min(minutes, 24 * 60) * 60_000);
}

export async function classify(platform: Platform, r: GatewayReply): Promise<Classified> {
  const e = readError(platform, r);
  const values = [e.code, e.subcode, e.message, e.user_msg, e.user_title];
  const rows = await catalog();
  // In catalog order (sort): the first row whose code (and subcode) and pattern both fit.
  const hit = rows.find(
    (c) =>
      (c.platform === platform || c.platform === "any") &&
      (c.code != null || Boolean(c.match_regex)) &&
      (c.code == null || (c.code === e.code && (c.subcode == null || c.subcode === e.subcode))) &&
      (!c.match_regex || test(c.match_regex, values)),
  );
  const detail = { platform, ...e, status: r.status };
  if (hit) {
    void feederDb().rpc("ad_error_seen", { p_id: hit.id }).then(({ error }) => error && console.error("[autopublish] error seen:", error.message));
    const fill = (s: string) => s.replace(/\{user_msg\}/g, e.user_msg || e.message || "").replace(/\{message\}/g, e.message || e.user_msg || "").trim();
    return {
      category: hit.category,
      action: hit.action,
      message: fill(hit.client_message ?? (hit.category === "RATE_LIMIT" ? "Waiting for the platform's limit to reset." : e.user_msg || e.message || "The platform said no.")),
      fix_field: hit.fix_field,
      code: e.code,
      retryAt: hit.action === "wait_rate_limit" ? retryFromUsage(r.usage) : null,
      detail,
    };
  }
  // Unknown: Retexia looks at it (a draft catalog row, once per platform + code + subcode).
  void draft(platform, e).catch((err) => console.error("[autopublish] draft catalog:", err));
  return {
    category: "UNKNOWN",
    action: "needs_admin",
    message: e.user_msg ? `${e.user_title ? `${e.user_title}: ` : ""}${e.user_msg}` : "Something unexpected happened. The Retexia team has been told and will sort it out.",
    fix_field: null,
    code: e.code,
    retryAt: null,
    detail,
  };
}

async function draft(platform: Platform, e: ReturnType<typeof readError>) {
  const db = feederDb();
  let q = db.from("ad_error_catalog").select("id, hits").eq("is_draft", true).eq("platform", platform);
  q = e.code ? q.eq("code", e.code) : q.is("code", null);
  q = e.subcode ? q.eq("subcode", e.subcode) : q.is("subcode", null);
  const { data } = await q.limit(1).maybeSingle();
  if (data) {
    await db.rpc("ad_error_seen", { p_id: data.id });
    return;
  }
  await db.from("ad_error_catalog").insert({
    platform,
    code: e.code,
    subcode: e.subcode,
    category: "UNKNOWN",
    action: "needs_admin",
    is_draft: true,
    hits: 1,
    last_seen: new Date().toISOString(),
    admin_note: [e.user_title, e.user_msg, e.message].filter(Boolean).join(" | ").slice(0, 600),
  });
}
