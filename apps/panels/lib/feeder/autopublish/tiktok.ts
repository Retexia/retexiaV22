import "server-only";

import { feederDb } from "../db";
import { gateway, ttData, type GatewayReply } from "./gateway";
import { fillCopy, tiktokCta, tiktokText, type Audience } from "./plan";
import { fix, nameKey, slotRow, storageHiccup, type StepCtx, type StepResult } from "./step";
import type { NodeRow } from "./types";

/**
 * TikTok steps, Business API v1.3 (business-api.tiktok.com/open_api/v1.3).
 * code != 0 is an error even with HTTP 200 (the n8n gateway marks it).
 * Campaigns and ad groups are made DISABLED; activate() enables them last.
 * Videos only. Field names follow the v1.3 docs (campaign/create, adgroup/create,
 * ad/create, file/video/ad/upload, file/image/ad/upload, page/get, ad/get):
 * test with one launch on a test advertiser after any TikTok API change.
 */

const tt = (method: "GET" | "POST", path: string, params?: Record<string, unknown>) => gateway({ action: "tiktok", method, path, params });
const adv = (ctx: StepCtx) => ctx.account.tiktok_advertiser_id!;

/** GeoNames IDs TikTok uses for countries (location_ids). */
const LOCATION: Record<string, string> = {
  LK: "1227603",
  IN: "1269750",
  MV: "1282028",
  AE: "290557",
  QA: "289688",
  SA: "102358",
  KW: "285570",
  GB: "2635167",
  AU: "2077456",
  US: "6252001",
};
const AGE_GROUPS: [string, number, number][] = [
  ["AGE_18_24", 18, 24],
  ["AGE_25_34", 25, 34],
  ["AGE_35_44", 35, 44],
  ["AGE_45_54", 45, 54],
  ["AGE_55_100", 55, 100],
];
const OBJECTIVE = { leads: "LEAD_GENERATION", traffic: "TRAFFIC" } as Record<string, string>;

/** "YYYY-MM-DD HH:MM:SS" in UTC. */
const ttTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

export async function tiktokStep(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  switch (n.level) {
    case "media":
      return media(n, ctx);
    case "form":
      return form(n, ctx);
    case "campaign":
      return campaign(n, ctx);
    case "adset":
      return adgroup(n, ctx);
    case "ad":
      return ad(n, ctx);
    case "creative":
      return { kind: "done" };
  }
}

/** Video by link → TikTok, then its cover image (needed by the ad). */
async function media(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  const c = ctx.creatives.find((x) => x.position === n.creative_positions[0]);
  if (!c || c.kind !== "video") return fix("TikTok needs a video here.", "creative");
  if (!n.platform_id) {
    const link = await ctx.signedUrl(c.storage_path, 3 * 3600);
    if (!link) return storageHiccup();
    const r = await tt("POST", "file/video/ad/upload/", {
      advertiser_id: adv(ctx),
      upload_type: "UPLOAD_BY_URL",
      video_url: link,
      file_name: `${ctx.launch.ref}-${c.position}-${Date.now()}`.slice(0, 100),
    });
    const d = ttData(r);
    const id = r.ok ? String((Array.isArray(d) ? d[0]?.video_id : d?.video_id) ?? "") : "";
    if (!id) return { kind: "error", reply: r };
    return { kind: "wait", seconds: 15, platform_id: id, extra: { polls: 0 } };
  }
  if (n.platform_extra.cover_id) return { kind: "done", platform_id: n.platform_id };
  const polls = Number(n.platform_extra.polls ?? 0) + 1;
  const info = await tt("GET", "file/video/ad/info/", { advertiser_id: adv(ctx), video_ids: [n.platform_id] });
  if (!info.ok) return { kind: "error", reply: info, platform_id: n.platform_id };
  const v = (ttData(info)?.list ?? [])[0] as { video_cover_url?: string; poster_url?: string } | undefined;
  const cover = v?.video_cover_url || v?.poster_url;
  if (!cover) {
    if (polls > 40) return fix("TikTok is taking too long to process this video. Try a smaller MP4 and launch it again.", "creative");
    return { kind: "wait", seconds: 30, platform_id: n.platform_id, extra: { polls } };
  }
  const img = await tt("POST", "file/image/ad/upload/", { advertiser_id: adv(ctx), upload_type: "UPLOAD_BY_URL", image_url: cover, file_name: `${ctx.launch.ref}-${c.position}-cover-${Date.now()}`.slice(0, 100) });
  const imageId = img.ok ? String(ttData(img)?.image_id ?? "") : "";
  if (!imageId) return { kind: "error", reply: img, platform_id: n.platform_id };
  return { kind: "done", platform_id: n.platform_id, extra: { cover_id: imageId, video_id: n.platform_id } };
}

/** The TikTok Instant Form: picked at launch, or found by the product's form names. */
async function form(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  const picked = ctx.snap.forms.tiktok;
  if (picked) return { kind: "done", platform_id: picked.id, extra: { form_name: picked.name, picked: true } };
  if (n.platform_id) return { kind: "done", platform_id: n.platform_id };
  const forms = await tiktokForms(adv(ctx));
  if (!forms.ok) return { kind: "error", reply: forms.reply };
  const names = new Set([ctx.snap.product.form_name, ...ctx.snap.product.form_names].map(nameKey));
  const found = forms.list.find((f) => names.has(nameKey(f.name)));
  if (found) return { kind: "done", platform_id: found.id, extra: { form_name: found.name, found: true } };
  return fix(`Make a TikTok Instant Form named "${ctx.snap.product.form_name}" in TikTok Ads Manager (Tools → Instant forms), then press Retry. Or launch again and pick a TikTok form.`, "destination.tiktok_form");
}

export async function tiktokForms(advertiserId: string): Promise<{ ok: true; list: { id: string; name: string; status?: string }[] } | { ok: false; reply: GatewayReply }> {
  const r = await tt("GET", "page/get/", { advertiser_id: advertiserId, business_types: ["LEAD_GEN"], page_size: 100 });
  if (!r.ok) return { ok: false, reply: r };
  const list = ((ttData(r)?.list ?? []) as { page_id?: string | number; title?: string; name?: string; status?: string }[])
    .filter((p) => p.page_id != null)
    .map((p) => ({ id: String(p.page_id), name: String(p.title ?? p.name ?? p.page_id), status: p.status }));
  return { ok: true, list };
}

async function campaign(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  const objective = OBJECTIVE[ctx.snap.template.objective];
  if (!objective) return fix("This objective isn't available on TikTok yet.", "objective");
  if (n.action === "reuse") {
    const c = await getCampaign(ctx, n.existing_id!);
    if (!c.ok) return { kind: "error", reply: c.reply };
    if (!c.found) return fix(`TikTok campaign ${n.existing_id} wasn't found in your ad account. Check the campaign ID in the template.`, "structure.campaign.existing_id.tiktok");
    if (c.found.objective_type && c.found.objective_type !== objective) return fix(`TikTok campaign "${c.found.campaign_name}" has a different objective (${c.found.objective_type}).`, "structure.campaign.existing_id.tiktok");
    return { kind: "done", platform_id: n.existing_id, extra: { campaign_budget: c.cbo, name: c.found.campaign_name } };
  }
  if (n.platform_id) return { kind: "done", platform_id: n.platform_id };
  if (n.action === "slot") {
    const db = feederDb();
    const slot = await slotRow(ctx, n);
    if (slot.campaign_id) {
      const c = await getCampaign(ctx, slot.campaign_id);
      if (!c.ok) return { kind: "error", reply: c.reply };
      if (c.found) {
        await db.from("ad_slots").update({ launches: slot.launches + 1, updated_at: new Date().toISOString() }).eq("id", slot.id);
        return { kind: "done", platform_id: slot.campaign_id, extra: { slot: true, existed: true, campaign_budget: c.cbo } };
      }
      await db.from("ad_slots").update({ campaign_id: null, launches: 0, updated_at: new Date().toISOString() }).eq("id", slot.id);
    }
    const made = await create(n, ctx, objective);
    if (made.kind !== "done" || !made.platform_id) return made;
    await db.from("ad_slots").update({ campaign_id: made.platform_id, launches: 1, updated_at: new Date().toISOString() }).eq("id", slot.id);
    return { ...made, extra: { ...made.extra, slot: true, existed: false } };
  }
  return create(n, ctx, objective);
}

async function getCampaign(ctx: StepCtx, id: string) {
  const r = await tt("GET", "campaign/get/", { advertiser_id: adv(ctx), filtering: { campaign_ids: [id] }, fields: ["campaign_id", "campaign_name", "objective_type", "budget_mode", "budget_optimize_on", "operation_status", "secondary_status"] });
  if (!r.ok) return { ok: false as const, reply: r };
  const c = (ttData(r)?.list ?? [])[0] as { objective_type?: string; budget_optimize_on?: boolean; budget_mode?: string; campaign_name?: string; secondary_status?: string } | undefined;
  const found = c && !/DELETE/.test(String(c.secondary_status ?? "")) ? c : null;
  return { ok: true as const, found, cbo: Boolean(found?.budget_optimize_on) || (found?.budget_mode != null && found.budget_mode !== "BUDGET_MODE_INFINITE") };
}

async function create(n: NodeRow, ctx: StepCtx, objective: string): Promise<StepResult> {
  const params: Record<string, unknown> = { advertiser_id: adv(ctx), campaign_name: n.name, objective_type: objective, operation_status: "DISABLE" };
  if (n.budget_daily != null) Object.assign(params, { budget_mode: "BUDGET_MODE_DAY", budget: n.budget_daily, budget_optimize_on: true });
  else if (n.budget_lifetime != null) Object.assign(params, { budget_mode: "BUDGET_MODE_TOTAL", budget: n.budget_lifetime, budget_optimize_on: true });
  else Object.assign(params, { budget_mode: "BUDGET_MODE_INFINITE", budget_optimize_on: false });
  const r = await tt("POST", "campaign/create/", params);
  const id = r.ok ? String(ttData(r)?.campaign_id ?? "") : "";
  if (!id) return { kind: "error", reply: r };
  return { kind: "done", platform_id: id, extra: { campaign_budget: n.budget_daily != null || n.budget_lifetime != null } };
}

function ageGroups(a: Audience) {
  const max = a.mode === "ai" ? 100 : a.age_max;
  return AGE_GROUPS.filter(([, lo, hi]) => hi >= a.age_min && lo <= max).map(([g]) => g);
}

async function adgroup(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  const t = ctx.snap.template;
  if (n.action === "reuse") {
    const r = await tt("GET", "adgroup/get/", { advertiser_id: adv(ctx), filtering: { adgroup_ids: [n.existing_id] }, fields: ["adgroup_id", "adgroup_name", "campaign_id", "secondary_status"] });
    if (!r.ok) return { kind: "error", reply: r };
    const g = (ttData(r)?.list ?? [])[0] as { adgroup_name?: string } | undefined;
    if (!g) return fix(`TikTok ad group ${n.existing_id} wasn't found in your ad account. Check the ID in the template.`, "structure.adsets.existing_id.tiktok");
    return { kind: "done", platform_id: n.existing_id, extra: { name: g.adgroup_name } };
  }
  if (n.platform_id) return { kind: "done", platform_id: n.platform_id };
  const parent = n.parent_key ? ctx.node("tiktok", n.parent_key) : undefined;
  if (!parent?.platform_id) return { kind: "wait", seconds: 10 };
  const a = t.audiences[n.audience_index ?? 0] ?? t.audiences[0]!;
  const locations = a.countries.map((c) => LOCATION[c]).filter(Boolean);
  if (!locations.length) return fix(`${a.name}: TikTok locations here are ${Object.keys(LOCATION).join(", ")}. Pick one of them for TikTok.`, `audiences.${n.audience_index ?? 0}.countries`);

  const start = ctx.snap.starts_at && new Date(ctx.snap.starts_at).getTime() > Date.now() + 60_000 ? new Date(ctx.snap.starts_at) : new Date(Date.now() + 5 * 60_000);
  const params: Record<string, unknown> = {
    advertiser_id: adv(ctx),
    campaign_id: parent.platform_id,
    adgroup_name: n.name,
    placement_type: "PLACEMENT_TYPE_NORMAL",
    placements: ["PLACEMENT_TIKTOK"],
    location_ids: locations,
    age_groups: ageGroups(a),
    gender: a.mode === "manual" && a.genders !== "all" ? (a.genders === "male" ? "GENDER_MALE" : "GENDER_FEMALE") : "GENDER_UNLIMITED",
    schedule_type: ctx.snap.ends_at ? "SCHEDULE_START_END" : "SCHEDULE_FROM_NOW",
    schedule_start_time: ttTime(start),
    bid_type: "BID_TYPE_NO_BID",
    pacing: "PACING_MODE_SMOOTH",
    operation_status: "DISABLE",
  };
  if (ctx.snap.ends_at) params.schedule_end_time = ttTime(new Date(ctx.snap.ends_at));
  if (t.objective === "leads") Object.assign(params, { promotion_type: "LEAD_GENERATION", optimization_goal: "LEAD_GENERATION", billing_event: "OCPM" });
  else Object.assign(params, { promotion_type: "WEBSITE", optimization_goal: "CLICK", billing_event: "CPC" });
  // AI audience on TikTok: broad targeting (location, age, language) with targeting expansion on.
  if (a.mode === "ai") params.targeting_expansion = { expansion_enabled: true };

  const parentHasBudget = parent.platform_extra.campaign_budget;
  let budgetDaily = n.budget_daily;
  let budgetLifetime = n.budget_lifetime;
  if (parent.action !== "create" && parentHasBudget === true) {
    budgetDaily = null;
    budgetLifetime = null;
  }
  if (parent.action !== "create" && parentHasBudget === false && budgetDaily == null && budgetLifetime == null) {
    return fix("This TikTok campaign uses ad group budgets: set the template's budget to \"each ad set\" and enter an amount.", "structure.budget");
  }
  if (budgetDaily != null) Object.assign(params, { budget_mode: "BUDGET_MODE_DAY", budget: budgetDaily });
  else if (budgetLifetime != null) Object.assign(params, { budget_mode: "BUDGET_MODE_TOTAL", budget: budgetLifetime });
  else params.budget_mode = "BUDGET_MODE_INFINITE";

  const r = await tt("POST", "adgroup/create/", params);
  const id = r.ok ? String(ttData(r)?.adgroup_id ?? "") : "";
  if (!id) return { kind: "error", reply: r };
  return { kind: "done", platform_id: id, extra: { audience: a.name, ai_audience: a.mode === "ai" ? "broad_with_expansion" : null } };
}

async function ad(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  if (n.platform_id) return { kind: "done", platform_id: n.platform_id };
  const t = ctx.snap.template;
  const set = n.parent_key ? ctx.node("tiktok", n.parent_key) : undefined;
  const m = ctx.node("tiktok", `m${n.creative_positions[0]}`);
  const f = t.objective === "leads" ? ctx.node("tiktok", "f1") : undefined;
  if (!set?.platform_id || !m?.platform_id || !m.platform_extra.cover_id || (t.objective === "leads" && !f?.platform_id)) return { kind: "wait", seconds: 10 };
  if (!ctx.account.tiktok_identity_id || !ctx.account.tiktok_identity_type) return fix("Pick the TikTok account your ads show as (Autopublish → Accounts → TikTok).", "account.tiktok_identity_id");
  const creative: Record<string, unknown> = {
    ad_name: n.name,
    identity_type: ctx.account.tiktok_identity_type,
    identity_id: ctx.account.tiktok_identity_id,
    ad_format: "SINGLE_VIDEO",
    video_id: m.platform_id,
    image_ids: [m.platform_extra.cover_id],
    ad_text: fillCopy(n.platform_extra.text ?? tiktokText(t.copy), ctx.snap.product, ctx.snap.currency).slice(0, 100),
    call_to_action: tiktokCta(t.copy.cta),
  };
  if (t.objective === "leads") creative.page_id = f!.platform_id;
  else creative.landing_page_url = t.destination.url;
  const r = await tt("POST", "ad/create/", { advertiser_id: adv(ctx), adgroup_id: set.platform_id, creatives: [creative] });
  const d = ttData(r);
  const id = r.ok ? String((d?.ad_ids ?? [])[0] ?? d?.ad_id ?? "") : "";
  if (!id) return { kind: "error", reply: r };
  return { kind: "done", platform_id: id };
}

// ---------------------------------------------------------------------------
// Switching on / off, review
// ---------------------------------------------------------------------------

export function tiktokSetStatus(advertiserId: string, level: "campaign" | "adset" | "ad", ids: string[], status: "ENABLE" | "DISABLE") {
  const path = level === "campaign" ? "campaign/status/update/" : level === "adset" ? "adgroup/status/update/" : "ad/status/update/";
  const key = level === "campaign" ? "campaign_ids" : level === "adset" ? "adgroup_ids" : "ad_ids";
  return tt("POST", path, { advertiser_id: advertiserId, [key]: ids, operation_status: status });
}

export async function tiktokReview(advertiserId: string, adIds: string[]) {
  const map = new Map<string, { state: "in_review" | "live" | "disapproved" | "paused" | "archived" | null; status: string; reasons: string[] }>();
  for (let i = 0; i < adIds.length; i += 100) {
    const ids = adIds.slice(i, i + 100);
    const r = await tt("GET", "ad/get/", { advertiser_id: advertiserId, filtering: { ad_ids: ids }, fields: ["ad_id", "secondary_status", "operation_status"], page_size: 100 });
    if (!r.ok) return { ok: false as const, reply: r };
    const rejected: string[] = [];
    for (const a of (ttData(r)?.list ?? []) as { ad_id: string | number; secondary_status?: string; operation_status?: string }[]) {
      const s = String(a.secondary_status ?? "");
      let state: "in_review" | "live" | "disapproved" | "paused" | "archived" | null = null;
      if (/REJECT|NOT_APPROVED|DISAPPROVE/.test(s)) state = "disapproved";
      else if (/AUDIT|REVIEW/.test(s)) state = "in_review";
      else if (/DELETE/.test(s)) state = "archived";
      else if (/DISABLE|PAUSE/.test(s) || a.operation_status === "DISABLE") state = "paused";
      else if (/DELIVERY_OK|DELIVERING|ACTIVE|LEARNING/.test(s)) state = "live";
      if (state === "disapproved") rejected.push(String(a.ad_id));
      map.set(String(a.ad_id), { state, status: s, reasons: [] });
    }
    if (rejected.length) {
      const info = await tt("GET", "ad/review_info/", { advertiser_id: advertiserId, ad_ids: rejected });
      const d = ttData(info) ?? {};
      for (const id of rejected) {
        const entry = d?.ad_review_map?.[id] ?? d?.[id] ?? null;
        const reasons = JSON.stringify(entry ?? {})
          .match(/"(?:reject_reason|reason|suggestion|content)":"([^"]{3,300})"/g)
          ?.map((x) => x.replace(/^"[^"]+":"|"$/g, "")) ?? [];
        const cur = map.get(id);
        if (cur) cur.reasons = [...new Set(reasons)].slice(0, 3);
      }
    }
  }
  return { ok: true as const, map };
}

/** Connection check: the advertiser, its TikTok accounts (identities) and Instant Forms. */
export async function tiktokCheck(advertiserId: string | null, via: "partner" | "token" = "partner") {
  const problems: string[] = [];
  const info: Record<string, unknown> = { checked_at: new Date().toISOString() };
  if (!advertiserId) return { ok: false, info: { ...info, problems: ["Enter the TikTok advertiser ID."] } };
  const a = await tt("GET", "advertiser/info/", { advertiser_ids: [advertiserId], fields: ["name", "status", "currency", "timezone", "display_timezone"] });
  const row = a.ok ? ((ttData(a)?.list ?? [])[0] as { name?: string; status?: string; currency?: string; timezone?: string; display_timezone?: string } | undefined) : undefined;
  if (!row) problems.push(a.network ? `Retexia couldn't reach TikTok just now (${String(a.body?.error?.message ?? "no answer").slice(0, 120)}). Try again in a minute.` : via === "token" ? `Your TikTok token can't open advertiser ${advertiserId}. Make sure the token was made for this advertiser (with Ads Management access), then check again.` : `Retexia can't open TikTok advertiser ${advertiserId} yet. Share it with Retexia's Business Center, then check again.`);
  else {
    Object.assign(info, { name: row.name, status: row.status, currency: row.currency, timezone: row.display_timezone ?? row.timezone });
    if (row.status && !/ENABLE|ACTIVE/.test(row.status)) problems.push(`TikTok shows this ad account as ${row.status}. Check it in TikTok Ads Manager.`);
  }
  if (row) {
    const ids = await tt("GET", "identity/get/", { advertiser_id: advertiserId, page_size: 100 });
    if (ids.ok) {
      info.identities = ((ttData(ids)?.identity_list ?? ttData(ids)?.list ?? []) as { identity_id: string; identity_type: string; display_name?: string }[]).map((x) => ({ id: String(x.identity_id), type: String(x.identity_type), name: String(x.display_name ?? x.identity_id) }));
    }
    const forms = await tiktokForms(advertiserId);
    if (forms.ok) info.forms = forms.list;
  }
  return { ok: problems.length === 0, info: { ...info, problems } };
}
