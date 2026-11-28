import "server-only";

import { feederDb } from "../db";
import { gateway, type GatewayReply } from "./gateway";
import { fillCopy, type Audience, type Objective } from "./plan";
import { fix, nameKey, slotRow, storageHiccup, type StepCtx, type StepResult } from "./step";
import type { NodeRow } from "./types";

/**
 * Meta (Facebook / Instagram) steps, Marketing API (ODAX objectives). The
 * Graph version is set in the n8n workflow (Config → graphVersion, v26.0 or
 * newer). Everything is created PAUSED; activate() switches it on last.
 *
 * Docs: developers.facebook.com/docs/marketing-api/reference (campaign,
 * ad-campaign (ad set), ad-creative, adgroup (ad), ad-account/advideos,
 * ad-account/adimages, page/leadgen_forms).
 */

const OBJECTIVE: Record<Objective, string> = { leads: "OUTCOME_LEADS", messages: "OUTCOME_ENGAGEMENT", traffic: "OUTCOME_TRAFFIC", sales: "OUTCOME_SALES" };
/** Currencies Meta keeps without cents (budgets are sent in the smallest unit). */
const NO_CENTS = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "PYG", "UGX", "XAF", "XOF"]);
export const minor = (amount: number, currency: string) => Math.round(amount * (NO_CENTS.has(currency) ? 1 : 100));

const act = (ctx: StepCtx) => `act_${ctx.account.meta_ad_account_id}`;
const meta = (method: "GET" | "POST", path: string, params?: Record<string, unknown>) => gateway({ action: "meta", method, path, params });
const metaPage = (method: "GET" | "POST", pageId: string, path: string, params?: Record<string, unknown>) => gateway({ action: "meta_page", method, page_id: pageId, path, params });
const idOf = (r: GatewayReply) => (r.body && typeof r.body.id === "string" ? r.body.id : r.body && r.body.id != null ? String(r.body.id) : null);

/** ISO time for Meta (UTC). */
const iso = (s: string | null) => (s ? new Date(s).toISOString().replace(/\.\d{3}Z$/, "+0000") : null);

function copyFor(ctx: StepCtx) {
  const c = ctx.snap.template.copy;
  const p = ctx.snap.product;
  const fill = (t: string) => fillCopy(t, p, ctx.snap.currency);
  return { message: fill(c.primary_text), headline: fill(c.headline), description: fill(c.description), cta: c.cta };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export async function metaStep(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  switch (n.level) {
    case "media":
      return media(n, ctx);
    case "form":
      return form(n, ctx);
    case "campaign":
      return campaign(n, ctx);
    case "adset":
      return adset(n, ctx);
    case "creative":
      return creative(n, ctx);
    case "ad":
      return ad(n, ctx);
  }
}

/** Video → advideos (Meta fetches it from a signed link), then wait until it is ready and take its thumbnail. Image → adimages hash. */
async function media(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  const c = ctx.creatives.find((x) => x.position === n.creative_positions[0]);
  if (!c) return fix("This creative's file is missing. Launch it again.", "creative");
  if (c.kind === "image") {
    if (n.platform_id) return { kind: "done", platform_id: n.platform_id };
    const link = await ctx.signedUrl(c.storage_path, 3600);
    if (!link) return storageHiccup();
    const r = await gateway({ action: "meta_image", account: act(ctx), image_url: link });
    if (!r.ok) return { kind: "error", reply: r };
    const images = (r.body?.images ?? {}) as Record<string, { hash?: string; url?: string }>;
    const first = Object.values(images)[0];
    if (!first?.hash) return { kind: "error", reply: { ...r, ok: false, body: { error: { message: "adimages: no hash in the reply" } } } };
    return { kind: "done", platform_id: first.hash, extra: { image_hash: first.hash, image_url: first.url ?? null } };
  }

  // Video
  if (!n.platform_id) {
    const link = await ctx.signedUrl(c.storage_path, 3 * 3600);
    if (!link) return storageHiccup();
    const r = await meta("POST", `${act(ctx)}/advideos`, { file_url: link, name: n.name.slice(0, 100) });
    const id = r.ok ? idOf(r) : null;
    if (!id) return { kind: "error", reply: r };
    return { kind: "wait", seconds: 20, platform_id: id, extra: { uploaded_at: new Date().toISOString(), polls: 0 } };
  }
  const r = await meta("GET", n.platform_id, { fields: "status" });
  if (!r.ok) return { kind: "error", reply: r, platform_id: n.platform_id };
  const status = String(r.body?.status?.video_status ?? "").toLowerCase();
  const polls = Number(n.platform_extra.polls ?? 0) + 1;
  if (status === "error") {
    if (!n.platform_extra.reuploaded) return { kind: "wait", seconds: 5, platform_id: null, extra: { reuploaded: true, polls: 0 } };
    return fix("Meta couldn't process this video. Export it again as MP4 (H.264, AAC sound) and launch it again.", "creative");
  }
  if (status !== "ready") {
    if (polls > 40) {
      // 20 minutes: upload once more, then ask.
      if (!n.platform_extra.reuploaded) return { kind: "wait", seconds: 5, platform_id: null, extra: { reuploaded: true, polls: 0 } };
      return fix("Meta is taking too long to process this video. Try a smaller file (under 100 MB) and launch it again.", "creative");
    }
    return { kind: "wait", seconds: 30, platform_id: n.platform_id, extra: { polls } };
  }
  const t = await meta("GET", `${n.platform_id}/thumbnails`, { fields: "uri,is_preferred" });
  const list = (t.ok && Array.isArray(t.body?.data) ? t.body.data : []) as { uri?: string; is_preferred?: boolean }[];
  const thumb = list.find((x) => x.is_preferred)?.uri ?? list[0]?.uri ?? null;
  if (!thumb) return { kind: "wait", seconds: 20, platform_id: n.platform_id, extra: { polls } };
  return { kind: "done", platform_id: n.platform_id, extra: { video_id: n.platform_id, thumbnail_url: thumb } };
}

/** The Instant Form, named exactly after the product's form name: picked at launch, found on the Page, or made. */
async function form(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  const page = ctx.account.meta_page_id!;
  const picked = ctx.snap.forms.meta;
  if (picked) return { kind: "done", platform_id: picked.id, extra: { form_name: picked.name, picked: true } };
  if (n.platform_id) return { kind: "done", platform_id: n.platform_id };
  if (n.action === "reuse") return fix("Pick the Instant Form for this product, then press Retry.", "destination.meta_form");
  const want = nameKey(n.name);

  // Made before by Retexia (or picked before) for this Page.
  const db = feederDb();
  const { data: known } = await db.from("ad_lead_forms").select("form_id, name").eq("user_id", ctx.launch.user_id).eq("platform", "meta").eq("page_id", page);
  const mine = (known ?? []).find((f) => nameKey(f.name) === want);
  // On the Page (active forms only).
  const list = await metaPage("GET", page, `${page}/leadgen_forms`, { fields: "id,name,status", limit: 200 });
  if (!list.ok) return { kind: "error", reply: list };
  const forms = (Array.isArray(list.body?.data) ? list.body.data : []) as { id: string; name: string; status?: string }[];
  const active = forms.filter((f) => !f.status || f.status === "ACTIVE");
  const found = active.find((f) => f.id === mine?.form_id) ?? active.find((f) => nameKey(f.name) === want);
  if (found) {
    await remember(ctx, page, found.id, found.name, false);
    return { kind: "done", platform_id: found.id, extra: { form_name: found.name, found: true } };
  }

  const privacy = ctx.account.privacy_policy_url;
  if (!privacy) return fix(`There is no Instant Form named "${n.name}" on your Page yet. Add your privacy policy link (Autopublish → Accounts) so Retexia can make it, then press Retry.`, "account.privacy_policy_url");
  const lf = ctx.snap.template.destination.lead_form;
  const questions: Record<string, unknown>[] = [{ type: "FULL_NAME" }, { type: "PHONE" }, { type: "STREET_ADDRESS" }];
  if (lf.city) questions.push({ type: "CITY" });
  if (lf.quantity) {
    questions.push({
      type: "CUSTOM",
      key: "quantity",
      label: "Quantity",
      options: ["1", "2", "3", "4", "5"].map((v) => ({ key: v, value: v })),
    });
  }
  const params: Record<string, unknown> = {
    name: n.name,
    locale: "EN_US",
    questions,
    privacy_policy: { url: privacy, link_text: "Privacy policy" },
    follow_up_action_url: privacy,
  };
  if (lf.intro.trim()) params.context_card = { title: ctx.snap.product.name.slice(0, 60), style: "PARAGRAPH_STYLE", content: [lf.intro.trim().slice(0, 300)] };
  const r = await metaPage("POST", page, `${page}/leadgen_forms`, params);
  const id = r.ok ? idOf(r) : null;
  if (!id) return { kind: "error", reply: r };
  await remember(ctx, page, id, n.name, true);
  return { kind: "done", platform_id: id, extra: { form_name: n.name, made: true }, note: `Made the Instant Form "${n.name}" on your Page.` };
}

async function remember(ctx: StepCtx, page: string, formId: string, name: string, made: boolean) {
  const { error } = await feederDb()
    .from("ad_lead_forms")
    .upsert({ user_id: ctx.launch.user_id, platform: "meta", page_id: page, form_id: formId, name, product_id: ctx.snap.product.id, made_by_retexia: made }, { onConflict: "user_id,platform,form_id", ignoreDuplicates: false });
  if (error) console.error("[autopublish] remember form:", error.message);
}

/** Campaign: reuse (check only), evergreen slot (find or make once), or new. Always PAUSED. */
async function campaign(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  const objective = OBJECTIVE[ctx.snap.template.objective];
  if (n.action === "reuse") {
    const id = n.existing_id!;
    const r = await meta("GET", id, { fields: "id,account_id,objective,daily_budget,lifetime_budget,effective_status,name" });
    if (!r.ok) return { kind: "error", reply: r };
    if (String(r.body.account_id) !== ctx.account.meta_ad_account_id) return fix(`Campaign ${id} isn't in your ad account. Check the campaign ID in the template.`, "structure.campaign.existing_id.meta");
    if (r.body.objective && r.body.objective !== objective) return fix(`Campaign "${r.body.name}" has a different objective (${r.body.objective}). Pick a ${objective} campaign or change the template's objective.`, "structure.campaign.existing_id.meta");
    if (["DELETED", "ARCHIVED"].includes(String(r.body.effective_status))) return fix(`Campaign "${r.body.name}" is deleted or archived. Pick another campaign.`, "structure.campaign.existing_id.meta");
    return { kind: "done", platform_id: id, extra: { campaign_budget: Boolean(r.body.daily_budget || r.body.lifetime_budget), name: r.body.name } };
  }
  if (n.platform_id) return { kind: "done", platform_id: n.platform_id };

  if (n.action === "slot") {
    const slot = await slotRow(ctx, n);
    if (slot.campaign_id) {
      const r = await meta("GET", slot.campaign_id, { fields: "id,effective_status,daily_budget,lifetime_budget" });
      // Gone only when Meta says so (deleted / archived, or "does not exist": code 100, subcode 33).
      // Any other error (rate limit, permission, Meta down) is handled as an error: never make a second evergreen campaign by mistake.
      const missing = !r.ok && Number(r.body?.error?.code) === 100 && Number(r.body?.error?.error_subcode) === 33;
      const gone = missing || (r.ok && ["DELETED", "ARCHIVED"].includes(String(r.body?.effective_status)));
      if (!gone && !r.ok) return { kind: "error", reply: r };
      if (!gone) {
        await feederDb().from("ad_slots").update({ launches: slot.launches + 1, updated_at: new Date().toISOString() }).eq("id", slot.id);
        return { kind: "done", platform_id: slot.campaign_id, extra: { slot: true, existed: true, campaign_budget: Boolean(r.body.daily_budget || r.body.lifetime_budget), was_status: r.body.effective_status } };
      }
      await feederDb().from("ad_slots").update({ campaign_id: null, launches: 0, updated_at: new Date().toISOString() }).eq("id", slot.id);
    }
    const made = await createCampaign(n, ctx, objective);
    if (made.kind !== "done" || !made.platform_id) return made;
    await feederDb().from("ad_slots").update({ campaign_id: made.platform_id, launches: 1, updated_at: new Date().toISOString() }).eq("id", slot.id);
    return { ...made, extra: { ...made.extra, slot: true, existed: false } };
  }
  return createCampaign(n, ctx, objective);
}

async function createCampaign(n: NodeRow, ctx: StepCtx, objective: string): Promise<StepResult> {
  const cur = ctx.snap.currency;
  const params: Record<string, unknown> = { name: n.name, objective, status: "PAUSED", special_ad_categories: [], buying_type: "AUCTION" };
  if (n.budget_daily != null) params.daily_budget = minor(n.budget_daily, cur);
  if (n.budget_lifetime != null) params.lifetime_budget = minor(n.budget_lifetime, cur);
  if (n.budget_daily != null || n.budget_lifetime != null) params.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
  else params.is_adset_budget_sharing_enabled = false;
  const r = await meta("POST", `${act(ctx)}/campaigns`, params);
  const id = r.ok ? idOf(r) : null;
  if (!id) return { kind: "error", reply: r };
  return { kind: "done", platform_id: id, extra: { campaign_budget: n.budget_daily != null || n.budget_lifetime != null } };
}

function targeting(a: Audience) {
  const t: Record<string, unknown> = { geo_locations: { countries: a.countries } };
  const interests = a.interests.length ? [{ interests: a.interests.map((i) => ({ id: i.id, name: i.name })) }] : null;
  if (a.mode === "ai") {
    // Advantage+ audience: location and minimum age are hard limits; ages, gender and interests are suggestions.
    t.age_min = a.age_min;
    t.age_max = 65;
    if (a.suggest_age) t.age_range = a.suggest_age;
    if (a.genders !== "all") t.genders = [a.genders === "male" ? 1 : 2];
    if (interests) t.flexible_spec = interests;
    t.targeting_automation = { advantage_audience: 1 };
  } else {
    t.age_min = a.age_min;
    t.age_max = a.age_max;
    if (a.genders !== "all") t.genders = [a.genders === "male" ? 1 : 2];
    if (interests) t.flexible_spec = interests;
    t.targeting_automation = { advantage_audience: 0 };
  }
  return t;
}

/** Ad set: reuse (check it's yours and has room), or new with targeting, goal and (when it holds it) the budget. */
async function adset(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  const t = ctx.snap.template;
  if (n.action === "reuse") {
    const id = n.existing_id!;
    const r = await meta("GET", id, { fields: "id,account_id,campaign_id,effective_status,name" });
    if (!r.ok) return { kind: "error", reply: r };
    if (String(r.body.account_id) !== ctx.account.meta_ad_account_id) return fix(`Ad set ${id} isn't in your ad account. Check the ad set ID in the template.`, "structure.adsets.existing_id.meta");
    if (["DELETED", "ARCHIVED"].includes(String(r.body.effective_status))) return fix(`Ad set "${r.body.name}" is deleted or archived. Pick another.`, "structure.adsets.existing_id.meta");
    const ads = await meta("GET", `${id}/ads`, { limit: 0, summary: "total_count", effective_status: ["ACTIVE", "PAUSED", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES"] });
    const have = ads.ok ? Number(ads.body?.summary?.total_count ?? 0) : 0;
    const adding = ctx.nodes.filter((x) => x.platform === "meta" && x.parent_key === n.key && x.level === "ad" && x.state !== "skipped").length;
    if (have + adding > 50) return fix(`Ad set "${r.body.name}" has ${have} ads; Meta allows 50 that aren't archived. Archive some old ads in Ads Manager or use another ad set.`, "structure");
    return { kind: "done", platform_id: id, extra: { name: r.body.name } };
  }
  if (n.platform_id) return { kind: "done", platform_id: n.platform_id };

  const parent = n.parent_key ? ctx.node("meta", n.parent_key) : undefined;
  if (!parent?.platform_id) return { kind: "wait", seconds: 10 };
  const a = t.audiences[n.audience_index ?? 0] ?? t.audiences[0]!;
  const cur = ctx.snap.currency;
  const params: Record<string, unknown> = {
    name: n.name,
    campaign_id: parent.platform_id,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    targeting: targeting(a),
  };
  const page = ctx.account.meta_page_id!;
  switch (t.objective) {
    case "leads":
      Object.assign(params, { optimization_goal: "LEAD_GENERATION", destination_type: "ON_AD", promoted_object: { page_id: page } });
      break;
    case "messages":
      if (t.destination.message_app === "whatsapp") {
        if (!ctx.account.meta_whatsapp) return fix("Add the WhatsApp number linked to your Page (Autopublish → Accounts).", "account.meta_whatsapp");
        Object.assign(params, { optimization_goal: "CONVERSATIONS", destination_type: "WHATSAPP", promoted_object: { page_id: page, whatsapp_phone_number: ctx.account.meta_whatsapp } });
      } else {
        Object.assign(params, { optimization_goal: "CONVERSATIONS", destination_type: "MESSENGER", promoted_object: { page_id: page } });
      }
      break;
    case "traffic":
      Object.assign(params, { optimization_goal: n.platform_extra.use_link_clicks ? "LINK_CLICKS" : "LANDING_PAGE_VIEWS", destination_type: "WEBSITE" });
      break;
    case "sales":
      if (!ctx.account.meta_pixel_id) return fix("Website sales need your Meta Pixel ID (Autopublish → Accounts).", "account.meta_pixel_id");
      Object.assign(params, { optimization_goal: "OFFSITE_CONVERSIONS", destination_type: "WEBSITE", promoted_object: { pixel_id: ctx.account.meta_pixel_id, custom_event_type: t.destination.pixel_event } });
      break;
  }
  // Start / end in the customer's time zone, stored as UTC.
  const start = iso(ctx.snap.starts_at);
  if (start && new Date(ctx.snap.starts_at!).getTime() > Date.now() + 60_000) params.start_time = start;
  const end = iso(ctx.snap.ends_at);
  if (end) params.end_time = end;

  // Budget: only when this ad set holds it. A reused / evergreen campaign decides (campaign budget → none here).
  let budgetDaily = n.budget_daily;
  let budgetLifetime = n.budget_lifetime;
  const parentHasBudget = parent.platform_extra.campaign_budget;
  if (parent.action !== "create" && parentHasBudget === true && (budgetDaily != null || budgetLifetime != null)) {
    budgetDaily = null;
    budgetLifetime = null;
  }
  if (parent.action !== "create" && parentHasBudget === false && budgetDaily == null && budgetLifetime == null) {
    return fix("This campaign uses ad set budgets: set the template's budget to \"each ad set\" and enter an amount.", "structure.budget");
  }
  if (budgetDaily != null) params.daily_budget = minor(budgetDaily, cur);
  if (budgetLifetime != null) {
    params.lifetime_budget = minor(budgetLifetime, cur);
    if (!end) return fix("A lifetime budget needs an end date: set how many days the ads run.", "schedule.duration_days");
  }
  if (budgetDaily != null || budgetLifetime != null) params.bid_strategy = "LOWEST_COST_WITHOUT_CAP";

  const r = await meta("POST", `${act(ctx)}/adsets`, params);
  const id = r.ok ? idOf(r) : null;
  if (!id) return { kind: "error", reply: r };
  return { kind: "done", platform_id: id, extra: { audience: a.name, ai_audience: a.mode === "ai", budget_daily: budgetDaily, budget_lifetime: budgetLifetime } };
}

function callToAction(ctx: StepCtx, formId: string | null) {
  const t = ctx.snap.template;
  const c = copyFor(ctx);
  switch (t.objective) {
    case "leads":
      return { link: "http://fb.me/", cta: { type: c.cta, value: { lead_gen_form_id: formId, link: "http://fb.me/" } } };
    case "messages":
      return t.destination.message_app === "whatsapp"
        ? { link: "https://api.whatsapp.com/send", cta: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } } }
        : { link: "https://fb.com/messenger_doc/", cta: { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER" } } };
    default:
      return { link: t.destination.url, cta: { type: c.cta, value: { link: t.destination.url } } };
  }
}

/** The ad creative: the Page (and Instagram) posting the video or image with the text, button and form. */
export async function buildCreative(ctx: StepCtx, position: number, name: string, copyOverride?: { message: string; headline: string; description: string }): Promise<StepResult> {
  const m = ctx.node("meta", `m${position}`);
  if (!m?.platform_id) return { kind: "wait", seconds: 10 };
  const f = ctx.snap.template.objective === "leads" ? ctx.node("meta", "f1") : undefined;
  if (ctx.snap.template.objective === "leads" && !f?.platform_id) return { kind: "wait", seconds: 10 };
  const c = { ...copyFor(ctx), ...(copyOverride ?? {}) };
  const { link, cta } = callToAction(ctx, f?.platform_id ?? null);
  const story: Record<string, unknown> = { page_id: ctx.account.meta_page_id };
  if (ctx.account.meta_instagram_id) story.instagram_user_id = ctx.account.meta_instagram_id;
  const kind = ctx.creatives.find((x) => x.position === position)?.kind ?? "video";
  if (kind === "video") {
    if (!m.platform_extra.thumbnail_url) return { kind: "wait", seconds: 10 };
    story.video_data = {
      video_id: m.platform_id,
      image_url: m.platform_extra.thumbnail_url,
      message: c.message,
      ...(c.headline ? { title: c.headline } : {}),
      ...(c.description ? { link_description: c.description } : {}),
      call_to_action: cta,
    };
  } else {
    story.link_data = {
      image_hash: m.platform_extra.image_hash ?? m.platform_id,
      link,
      message: c.message,
      ...(c.headline ? { name: c.headline } : {}),
      ...(c.description ? { description: c.description } : {}),
      call_to_action: cta,
    };
  }
  const r = await meta("POST", `${act(ctx)}/adcreatives`, { name, object_story_spec: story });
  const id = r.ok ? idOf(r) : null;
  if (!id) return { kind: "error", reply: r };
  return { kind: "done", platform_id: id };
}

async function creative(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  if (n.platform_id) return { kind: "done", platform_id: n.platform_id };
  return buildCreative(ctx, n.creative_positions[0]!, n.name, n.platform_extra.copy as { message: string; headline: string; description: string } | undefined);
}

async function ad(n: NodeRow, ctx: StepCtx): Promise<StepResult> {
  if (n.platform_id) return { kind: "done", platform_id: n.platform_id };
  const set = n.parent_key ? ctx.node("meta", n.parent_key) : undefined;
  const k = ctx.node("meta", `k${n.creative_positions[0]}`);
  if (!set?.platform_id || !k?.platform_id) return { kind: "wait", seconds: 10 };
  const params: Record<string, unknown> = { name: n.name, adset_id: set.platform_id, creative: { creative_id: k.platform_id }, status: "PAUSED" };
  if (ctx.snap.template.objective === "sales") {
    try {
      params.conversion_domain = new URL(ctx.snap.template.destination.url).hostname.replace(/^www\./, "");
    } catch {
      /* checked before launch */
    }
  }
  const r = await meta("POST", `${act(ctx)}/ads`, params);
  const id = r.ok ? idOf(r) : null;
  if (!id) return { kind: "error", reply: r };
  return { kind: "done", platform_id: id };
}

// ---------------------------------------------------------------------------
// Switching on / off, review
// ---------------------------------------------------------------------------

export const metaSetStatus = (id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED") => meta("POST", id, { status });

export type AdReview = { state: "in_review" | "live" | "disapproved" | "with_issues" | "paused" | "archived" | null; status: string; reasons: string[]; issue: GatewayReply | null };

/** Status of up to 50 ads in one call (Graph ?ids=). */
export async function metaReview(adIds: string[]): Promise<{ ok: true; map: Map<string, AdReview> } | { ok: false; reply: GatewayReply }> {
  const map = new Map<string, AdReview>();
  for (let i = 0; i < adIds.length; i += 50) {
    const ids = adIds.slice(i, i + 50);
    const r = await meta("GET", "", { ids: ids.join(","), fields: "effective_status,configured_status,ad_review_feedback,issues_info" });
    if (!r.ok) return { ok: false, reply: r };
    for (const id of ids) {
      const a = (r.body?.[id] ?? {}) as { effective_status?: string; ad_review_feedback?: Record<string, Record<string, string>>; issues_info?: { error_code?: number; error_summary?: string; error_message?: string }[] };
      const s = String(a.effective_status ?? "");
      const reasons: string[] = [];
      for (const scope of Object.values(a.ad_review_feedback ?? {})) for (const [policy, text] of Object.entries(scope ?? {})) reasons.push(`${policy.replace(/_/g, " ")}: ${String(text).slice(0, 400)}`);
      const issue = a.issues_info?.[0];
      let state: AdReview["state"] = null;
      if (s === "ACTIVE") state = "live";
      else if (["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"].includes(s)) state = "in_review";
      else if (s === "DISAPPROVED") state = "disapproved";
      else if (s === "WITH_ISSUES" || s === "PENDING_BILLING_INFO") state = "with_issues";
      else if (["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(s)) state = "paused";
      else if (["ARCHIVED", "DELETED"].includes(s)) state = "archived";
      map.set(id, {
        state,
        status: s,
        reasons,
        issue: issue ? { ok: false, status: 200, body: { error: { code: issue.error_code, message: issue.error_message ?? issue.error_summary, error_user_title: issue.error_summary, error_user_msg: issue.error_message } } } : s === "PENDING_BILLING_INFO" ? { ok: false, status: 200, body: { error: { message: "billing: payment method needed" } } } : null,
      });
    }
  }
  return { ok: true, map };
}

/** Plain explanations for common Meta policy names (the platform's own text follows). */
const POLICY_TIPS: [RegExp, string][] = [
  [/personal attribute/i, "Don't say or imply you know the viewer's health, age, weight or money (\"Do you have diabetes?\"). Talk about the product instead."],
  [/before.?and.?after|body image|weight loss/i, "Remove before/after pictures and body-shaming; show the product and its benefits."],
  [/unrealistic|misleading|outcome|claim/i, "Remove promises like \"cures in 3 days\" or guaranteed results."],
  [/landing page|destination|functional/i, "Check that the link or form works and matches the ad."],
  [/adult|sexual/i, "Remove suggestive pictures or words."],
  [/health|medical|pharmac|drug|supplement/i, "Health products: no cure claims and no doctor or before/after pictures."],
  [/grammar|profanity/i, "Fix spelling, symbols and ALL-CAPS text."],
  [/circumvent|cloak/i, "The Retexia team will look at this one with you."],
];
export function explainDisapproval(reasons: string[]) {
  const text = reasons.join(" ");
  const tip = POLICY_TIPS.find(([re]) => re.test(text))?.[1] ?? "Change the part of the text or video Meta mentions, then resubmit.";
  return `Meta didn't approve this ad${reasons.length ? `: ${reasons[0]}` : "."} ${tip}`.slice(0, 590);
}

/** Interest search (real IDs only; never made up). */
export async function metaInterests(q: string) {
  const r = await meta("GET", "search", { type: "adinterest", q, limit: 15, locale: "en_US" });
  if (!r.ok) return [];
  return ((Array.isArray(r.body?.data) ? r.body.data : []) as { id: string; name: string; audience_size_lower_bound?: number; audience_size_upper_bound?: number; path?: string[] }[])
    .filter((x) => /^\d{3,25}$/.test(String(x.id)))
    .map((x) => ({ id: String(x.id), name: String(x.name), size: x.audience_size_upper_bound ?? x.audience_size_lower_bound ?? null, path: (x.path ?? []).join(" › ") }));
}

/** Connection check: the ad account, the Page, Instagram and the Page's Instant Forms. */
export async function metaCheck(a: { meta_ad_account_id: string | null; meta_page_id: string | null; meta_instagram_id: string | null; meta_pixel_id: string | null }, via: "partner" | "token" = "partner") {
  const problems: string[] = [];
  // Own token: access comes from the System User's assets; partner: from sharing with Retexia's business.
  const give = (what: string, tasks: string) =>
    via === "token" ? `Give your System User access to ${what}${tasks ? ` (${tasks})` : ""} in Business settings, then generate the token again.` : `Share ${what} with Retexia's business${tasks ? ` (with ${tasks})` : ""}.`;
  const info: Record<string, unknown> = { checked_at: new Date().toISOString() };
  if (!a.meta_ad_account_id || !a.meta_page_id) return { ok: false, info: { ...info, problems: ["Enter the ad account ID and the Page ID."] } };
  const acct = await meta("GET", `act_${a.meta_ad_account_id}`, { fields: "name,account_status,disable_reason,currency,timezone_name,business{id,name}" });
  if (!acct.ok) problems.push(acct.network ? `Retexia couldn't reach Meta just now (${String(acct.body?.error?.message ?? "no answer").slice(0, 120)}). Try again in a minute.` : `Retexia can't open ad account ${a.meta_ad_account_id} yet. ${give("the ad account", "Manage campaigns")} Then check again.`);
  else {
    Object.assign(info, { account_name: acct.body.name, account_status: acct.body.account_status, currency: acct.body.currency, timezone: acct.body.timezone_name, business_name: acct.body.business?.name ?? null });
    if (acct.body.account_status !== 1) problems.push("Meta shows this ad account as not active (disabled, unpaid or under review). Open Meta Ads Manager → Account overview.");
  }
  const page = await meta("GET", a.meta_page_id, { fields: "name" });
  if (!page.ok && !page.network) problems.push(`Retexia can't open Page ${a.meta_page_id} yet. ${give("the Page", '"Create ads" and "Leads"')}`);
  else info.page_name = page.body.name;
  if (a.meta_instagram_id) {
    const ig = await meta("GET", a.meta_instagram_id, { fields: "username" });
    if (!ig.ok) problems.push(`Retexia can't use this Instagram account yet. Connect it to the Page. ${give("the Instagram account", "")}`);
    else info.instagram_name = ig.body.username;
  }
  if (a.meta_pixel_id) {
    const px = await meta("GET", a.meta_pixel_id, { fields: "name,last_fired_time" });
    if (!px.ok) problems.push(`Retexia can't use this Pixel yet. ${give("the Pixel", "")}`);
  }
  if (page.ok) {
    const forms = await metaPage("GET", a.meta_page_id, `${a.meta_page_id}/leadgen_forms`, { fields: "id,name,status", limit: 200 });
    if (forms.ok) info.forms = ((forms.body?.data ?? []) as { id: string; name: string; status?: string }[]).map((f) => ({ id: String(f.id), name: String(f.name), status: f.status }));
    else problems.push(`Retexia can't read your Page's Instant Forms yet. ${give("the Page", '"Leads"')}`);
  }
  return { ok: problems.length === 0, info: { ...info, problems } };
}
