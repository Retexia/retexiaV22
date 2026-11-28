/**
 * Retexia Feeder → Autopublish: templates and the plan compiler.
 *
 * Pure code (no imports, no server APIs): the launch screen uses it for the
 * live preview, the server for the checks before a launch and for the plan
 * it stores, so the same code decides the structure everywhere.
 *
 *   template + creatives + product → compile() → plan nodes per platform
 *     m3        media (one upload per creative per platform)
 *     f1        lead form (named exactly after the product's form name)
 *     c1        campaign          (new | evergreen "slot" | existing)
 *     c1.s2     ad set / ad group (new | existing)
 *     k3        ad creative (Meta only; TikTok's creative is part of the ad)
 *     c1.s2.a3  ad
 *
 * Tested by scripts/test-autopublish.mjs (node strips the types).
 */

export type Platform = "meta" | "tiktok";
export const PLATFORMS: Platform[] = ["meta", "tiktok"];
export type Objective = "leads" | "messages" | "traffic" | "sales";
export type PresetKey =
  | "one_adset_many_ads"
  | "adset_per_creative"
  | "evergreen"
  | "single"
  | "campaign_per_creative"
  | "adset_per_audience"
  | "matrix"
  | "existing_campaign"
  | "existing_adset";
export type SplitBy = "none" | "creative" | "audience" | "audience_x_creative";
export type Ids = { meta: string | null; tiktok: string | null };

export type Structure = {
  preset: PresetKey | "custom";
  campaign: { mode: "new" | "slot" | "existing"; per: "launch" | "creative"; existing_id: Ids };
  adsets: { mode: "new" | "existing"; split_by: SplitBy; existing_id: Ids };
  budget: {
    level: "campaign" | "adset";
    type: "daily" | "lifetime";
    /** Campaign level: per campaign. Ad set level with "divide": shared by the ad sets of a campaign. */
    amount: number | null;
    /** Ad set level with "fixed": each ad set. */
    adset_amount: number | null;
    adset_split: "fixed" | "divide";
    /** How far a launch may raise the budget (percent). */
    boost_pct_max: number;
  };
  /** TikTok's own amounts (its minimums are higher); empty = the same as above. */
  tiktok_budget: { amount: number | null; adset_amount: number | null };
};

export type Audience = {
  name: string;
  /** ai = the platform's AI audience (Meta Advantage+ audience, TikTok broad + expansion); manual = exact. */
  mode: "ai" | "manual";
  countries: string[];
  /** Hard minimum age (AI mode on Meta: 18–25). */
  age_min: number;
  /** Manual mode only (AI mode is always up to 65+). */
  age_max: number;
  /** AI mode: the ages you'd prefer (a suggestion the platform may go beyond). */
  suggest_age: [number, number] | null;
  genders: "all" | "male" | "female";
  /** Meta interests (real IDs from Meta's search); suggestions in AI mode, exact in manual. */
  interests: { id: string; name: string }[];
};

export type Schedule = { start: "immediate" | "next_day" | "in_hours"; hours: number | null; duration_days: number | null };
export type Copy = { primary_text: string; headline: string; description: string; cta: string; tiktok_text: string };
export type Destination = {
  /** product = the Instant Form named after the product's form name (reused, or made by Retexia); pick = choose one at launch. */
  lead_form: { mode: "product" | "pick"; quantity: boolean; city: boolean; intro: string };
  message_app: "whatsapp" | "messenger";
  url: string;
  pixel_event: "PURCHASE" | "LEAD" | "COMPLETE_REGISTRATION" | "ADD_TO_CART" | "INITIATED_CHECKOUT";
};
export type Override = "budget" | "start" | "copy";

export type TemplateData = {
  name: string;
  platforms: Platform[];
  objective: Objective;
  structure: Structure;
  audiences: Audience[];
  schedule: Schedule;
  copy: Copy;
  destination: Destination;
  target_cost_per_result: number | null;
  /** null = the account's setting. */
  require_approval: boolean | null;
  launch_as: "active" | "paused";
  image_on_tiktok: "skip_tiktok" | "reject";
  overridable: Override[];
};

export type Overrides = {
  budget?: number | null;
  tiktok_budget?: number | null;
  start?: Schedule["start"] | null;
  start_hours?: number | null;
  copy?: Partial<Copy> | null;
};

export type Issue = { field: string; message: string; platform?: Platform };

export type CompileCreative = { position: number; kind: "video" | "image"; name: string; approved?: boolean };
export type CompileInput = {
  template: TemplateData;
  creatives: CompileCreative[];
  /** form_name: the name every lead form and campaign is named after (one of the product's form names). */
  product: { name: string; form_name: string; price?: number | null; details?: string | null; about?: string | null };
  currency: string;
  /** Launch day (YYYY-MM-DD), for names. */
  date: string;
};

export type Level = "media" | "form" | "campaign" | "adset" | "creative" | "ad";
export type PlanNode = {
  platform: Platform;
  key: string;
  level: Level;
  parent_key: string | null;
  depends_on: string[];
  action: "create" | "reuse" | "slot";
  existing_id: string | null;
  creative_positions: number[];
  audience_index: number | null;
  name: string;
  budget_daily: number | null;
  budget_lifetime: number | null;
};

export type PlatformPlan = {
  platform: Platform;
  /** Why nothing is made on this platform (e.g. no videos for TikTok). */
  skipped: string | null;
  counts: { campaigns: number; adsets: number; ads: number; media: number };
  /** New daily budget made by this launch (lifetime ÷ days). */
  daily: number;
  summary: string;
};

export type CompileResult = {
  nodes: PlanNode[];
  platforms: PlatformPlan[];
  summary: string;
  errors: Issue[];
  warnings: Issue[];
};

// ---------------------------------------------------------------------------
// Labels and options
// ---------------------------------------------------------------------------

export const PLATFORM_LABEL: Record<Platform, string> = { meta: "Meta", tiktok: "TikTok" };
export const PLATFORM_LONG: Record<Platform, string> = { meta: "Facebook & Instagram", tiktok: "TikTok" };
export const OBJECTIVES: { value: Objective; label: string; description: string; tiktok: boolean }[] = [
  { value: "leads", label: "Leads (Instant Form)", description: "Name, phone and address in a form on Facebook / TikTok. Best for courier orders.", tiktok: true },
  { value: "messages", label: "Messages", description: "People message you on WhatsApp or Messenger.", tiktok: false },
  { value: "traffic", label: "Website visits", description: "People open your website or product page.", tiktok: true },
  { value: "sales", label: "Website sales", description: "Purchases on your website (needs a Meta Pixel).", tiktok: false },
];
export const objectiveLabel = (o: Objective) => OBJECTIVES.find((x) => x.value === o)?.label ?? o;

export const CTAS: Record<Objective, { value: string; label: string }[]> = {
  leads: [
    { value: "LEARN_MORE", label: "Learn more" },
    { value: "SIGN_UP", label: "Sign up" },
    { value: "GET_QUOTE", label: "Get quote" },
    { value: "APPLY_NOW", label: "Apply now" },
    { value: "GET_OFFER", label: "Get offer" },
    { value: "SUBSCRIBE", label: "Subscribe" },
  ],
  messages: [{ value: "MESSAGE", label: "Send message" }],
  traffic: [
    { value: "LEARN_MORE", label: "Learn more" },
    { value: "SHOP_NOW", label: "Shop now" },
    { value: "ORDER_NOW", label: "Order now" },
    { value: "BUY_NOW", label: "Buy now" },
    { value: "CONTACT_US", label: "Contact us" },
  ],
  sales: [
    { value: "SHOP_NOW", label: "Shop now" },
    { value: "BUY_NOW", label: "Buy now" },
    { value: "ORDER_NOW", label: "Order now" },
    { value: "GET_OFFER", label: "Get offer" },
    { value: "LEARN_MORE", label: "Learn more" },
  ],
};
/** TikTok's call-to-action values (the closest one is used). */
export const TIKTOK_CTAS = ["LEARN_MORE", "SIGN_UP", "SHOP_NOW", "ORDER_NOW", "CONTACT_US", "APPLY_NOW", "GET_QUOTE", "SUBSCRIBE"];
export const tiktokCta = (cta: string) => (TIKTOK_CTAS.includes(cta) ? cta : cta === "BUY_NOW" ? "SHOP_NOW" : "LEARN_MORE");

export const COUNTRIES: { value: string; label: string }[] = [
  { value: "LK", label: "Sri Lanka" },
  { value: "IN", label: "India" },
  { value: "MV", label: "Maldives" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "QA", label: "Qatar" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "KW", label: "Kuwait" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "US", label: "United States" },
];

/** Platform text limits (characters). */
export const LIMITS = { primary_text: 2000, headline: 255, description: 255, tiktok_text: 100, name: 120 };
export const MAX_CREATIVES = 10;
export const MAX_ADSETS_PER_LAUNCH = 50;
export const MAX_ADS_PER_ADSET = 50;
export const MAX_AUDIENCES = 5;

export const PRESETS: {
  key: PresetKey;
  label: string;
  description: string;
  /** campaigns · ad sets · ads, for the card. */
  shape: string;
  campaign: Structure["campaign"]["mode"];
  per: Structure["campaign"]["per"];
  adsets: Structure["adsets"]["mode"];
  split: SplitBy;
  level: Structure["budget"]["level"];
  recommended?: boolean;
}[] = [
  { key: "evergreen", label: "Add to evergreen campaign", description: "Best for launching every day: one long-running campaign per product keeps its budget and learning; each launch adds a new ad set.", shape: "1 kept · 1 new · N", campaign: "slot", per: "launch", adsets: "new", split: "none", level: "campaign", recommended: true },
  { key: "one_adset_many_ads", label: "One ad set, many ads", description: "Every creative in one ad set; the platform shows the best one most.", shape: "1 · 1 · N", campaign: "new", per: "launch", adsets: "new", split: "none", level: "campaign" },
  { key: "adset_per_creative", label: "Ad set per creative", description: "Creative testing: each creative in its own ad set with its own budget.", shape: "1 · N · N", campaign: "new", per: "launch", adsets: "new", split: "creative", level: "adset" },
  { key: "single", label: "Single ad", description: "Boost one creative.", shape: "1 · 1 · 1", campaign: "new", per: "launch", adsets: "new", split: "none", level: "campaign" },
  { key: "campaign_per_creative", label: "Campaign per creative", description: "Each creative fully separate, with its own campaign and budget.", shape: "N · N · N", campaign: "new", per: "creative", adsets: "new", split: "none", level: "campaign" },
  { key: "adset_per_audience", label: "Ad set per audience", description: "The same creatives shown to different audiences.", shape: "1 · A · A×N", campaign: "new", per: "launch", adsets: "new", split: "audience", level: "adset" },
  { key: "matrix", label: "Audience × creative", description: "Full test grid: every creative for every audience. Watch the budget.", shape: "1 · A×N · A×N", campaign: "new", per: "launch", adsets: "new", split: "audience_x_creative", level: "adset" },
  { key: "existing_campaign", label: "Add ad sets to a campaign", description: "Grow a campaign you made in Ads Manager: new ad sets go into it.", shape: "existing · new · N", campaign: "existing", per: "launch", adsets: "new", split: "none", level: "campaign" },
  { key: "existing_adset", label: "Add ads to an ad set", description: "Refresh a proven ad set with new ads.", shape: "existing · existing · N", campaign: "existing", per: "launch", adsets: "existing", split: "none", level: "campaign" },
];
export const presetLabel = (k: Structure["preset"]) => (k === "custom" ? "Custom" : (PRESETS.find((p) => p.key === k)?.label ?? k));

/** The structure for a preset, keeping the amounts and IDs already entered. */
export function applyPreset(s: Structure, key: PresetKey): Structure {
  const p = PRESETS.find((x) => x.key === key);
  if (!p) return s;
  const budget = { ...s.budget, level: p.level };
  if (p.level === "adset" && budget.adset_split === "fixed" && !budget.adset_amount && budget.amount) budget.adset_amount = budget.amount;
  if (p.level === "campaign" && !budget.amount && budget.adset_amount) budget.amount = budget.adset_amount;
  return {
    ...s,
    preset: key,
    campaign: { ...s.campaign, mode: p.campaign, per: p.per },
    adsets: { ...s.adsets, mode: p.adsets, split_by: p.split },
    budget,
  };
}

// ---------------------------------------------------------------------------
// Defaults and reading stored templates
// ---------------------------------------------------------------------------

export const defaultAudience = (): Audience => ({
  name: "Sri Lanka · AI",
  mode: "ai",
  countries: ["LK"],
  age_min: 18,
  age_max: 65,
  suggest_age: null,
  genders: "all",
  interests: [],
});

export function defaultTemplate(): TemplateData {
  return {
    name: "Daily product ads",
    platforms: ["meta"],
    objective: "leads",
    structure: {
      preset: "evergreen",
      campaign: { mode: "slot", per: "launch", existing_id: { meta: null, tiktok: null } },
      adsets: { mode: "new", split_by: "none", existing_id: { meta: null, tiktok: null } },
      budget: { level: "campaign", type: "daily", amount: 1500, adset_amount: null, adset_split: "fixed", boost_pct_max: 50 },
      tiktok_budget: { amount: null, adset_amount: null },
    },
    audiences: [defaultAudience()],
    schedule: { start: "immediate", hours: null, duration_days: null },
    copy: {
      // {details}: the product's description from Lingo Feeder's product details (lingo_feeder.products).
      primary_text: "{details}\n\n🚚 Cash on delivery anywhere in Sri Lanka. Fill in the form and we'll call you to confirm.",
      headline: "{product}",
      description: "Cash on delivery",
      cta: "LEARN_MORE",
      tiktok_text: "{product} — cash on delivery. Tap to order.",
    },
    destination: { lead_form: { mode: "product", quantity: true, city: true, intro: "" }, message_app: "whatsapp", url: "", pixel_event: "PURCHASE" },
    target_cost_per_result: null,
    require_approval: null,
    launch_as: "active",
    image_on_tiktok: "skip_tiktok",
    overridable: ["budget", "start", "copy"],
  };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const ids = (v: unknown): Ids => {
  const o = obj(v);
  const id = (x: unknown) => (typeof x === "string" && /^\d{5,25}$/.test(x.trim()) ? x.trim() : null);
  return { meta: id(o.meta), tiktok: id(o.tiktok) };
};

/** A template as stored (jsonb columns) → complete TemplateData with defaults filled in. */
export function readTemplate(row: Record<string, unknown>): TemplateData {
  const d = defaultTemplate();
  const s = obj(row.structure);
  const c = obj(s.campaign);
  const a = obj(s.adsets);
  const b = obj(s.budget);
  const tb = obj(s.tiktok_budget);
  const sch = obj(row.schedule);
  const cp = obj(row.copy);
  const ds = obj(row.destination);
  const lf = obj(ds.lead_form);
  const audiences = (Array.isArray(row.audiences) ? row.audiences : []).slice(0, MAX_AUDIENCES).map((x): Audience => {
    const o = obj(x);
    const sa = Array.isArray(o.suggest_age) && o.suggest_age.length === 2 ? [num(o.suggest_age[0]), num(o.suggest_age[1])] : null;
    return {
      name: str(o.name, "Audience").slice(0, 60) || "Audience",
      mode: oneOf(o.mode, ["ai", "manual"] as const, "ai"),
      countries: (Array.isArray(o.countries) ? o.countries : ["LK"]).filter((x): x is string => typeof x === "string" && /^[A-Z]{2}$/.test(x)).slice(0, 25),
      age_min: Math.min(65, Math.max(18, num(o.age_min) ?? 18)),
      age_max: Math.min(65, Math.max(18, num(o.age_max) ?? 65)),
      suggest_age: sa && sa[0] != null && sa[1] != null ? [sa[0], sa[1]] : null,
      genders: oneOf(o.genders, ["all", "male", "female"] as const, "all"),
      interests: (Array.isArray(o.interests) ? o.interests : [])
        .map((i) => obj(i))
        .filter((i) => typeof i.id === "string" && /^\d{3,25}$/.test(i.id) && typeof i.name === "string")
        .map((i) => ({ id: i.id as string, name: (i.name as string).slice(0, 100) }))
        .slice(0, 25),
    };
  });
  const platforms = (Array.isArray(row.platforms) ? row.platforms : []).filter((p): p is Platform => p === "meta" || p === "tiktok");
  return {
    name: str(row.name, d.name),
    platforms: platforms.length ? [...new Set(platforms)] : d.platforms,
    objective: oneOf(row.objective, ["leads", "messages", "traffic", "sales"] as const, "leads"),
    structure: {
      preset: oneOf(s.preset, [...PRESETS.map((p) => p.key), "custom"] as const, d.structure.preset),
      campaign: { mode: oneOf(c.mode, ["new", "slot", "existing"] as const, d.structure.campaign.mode), per: oneOf(c.per, ["launch", "creative"] as const, "launch"), existing_id: ids(c.existing_id) },
      adsets: { mode: oneOf(a.mode, ["new", "existing"] as const, "new"), split_by: oneOf(a.split_by, ["none", "creative", "audience", "audience_x_creative"] as const, "none"), existing_id: ids(a.existing_id) },
      budget: {
        level: oneOf(b.level, ["campaign", "adset"] as const, d.structure.budget.level),
        type: oneOf(b.type, ["daily", "lifetime"] as const, "daily"),
        amount: num(b.amount),
        adset_amount: num(b.adset_amount),
        adset_split: oneOf(b.adset_split, ["fixed", "divide"] as const, "fixed"),
        boost_pct_max: Math.min(500, Math.max(0, num(b.boost_pct_max) ?? 20)),
      },
      tiktok_budget: { amount: num(tb.amount), adset_amount: num(tb.adset_amount) },
    },
    audiences: audiences.length ? audiences : d.audiences,
    schedule: {
      start: oneOf(sch.start, ["immediate", "next_day", "in_hours"] as const, "immediate"),
      hours: num(sch.hours),
      duration_days: num(sch.duration_days),
    },
    copy: {
      primary_text: str(cp.primary_text),
      headline: str(cp.headline),
      description: str(cp.description),
      cta: str(cp.cta, "LEARN_MORE") || "LEARN_MORE",
      tiktok_text: str(cp.tiktok_text),
    },
    destination: {
      lead_form: { mode: oneOf(lf.mode, ["product", "pick"] as const, "product"), quantity: lf.quantity !== false, city: lf.city !== false, intro: str(lf.intro).slice(0, 300) },
      message_app: oneOf(ds.message_app, ["whatsapp", "messenger"] as const, "whatsapp"),
      url: str(ds.url),
      pixel_event: oneOf(ds.pixel_event, ["PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "ADD_TO_CART", "INITIATED_CHECKOUT"] as const, "PURCHASE"),
    },
    target_cost_per_result: num(row.target_cost_per_result),
    require_approval: typeof row.require_approval === "boolean" ? row.require_approval : null,
    launch_as: oneOf(row.launch_as, ["active", "paused"] as const, "active"),
    image_on_tiktok: oneOf(row.image_on_tiktok, ["skip_tiktok", "reject"] as const, "skip_tiktok"),
    overridable: (Array.isArray(row.overridable) ? row.overridable : d.overridable).filter((o): o is Override => o === "budget" || o === "start" || o === "copy"),
  };
}

// ---------------------------------------------------------------------------
// Money, names, copy
// ---------------------------------------------------------------------------

export function money(n: number | null | undefined, currency = "LKR") {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Math.round(n * 100) / 100;
  return `${currency} ${v.toLocaleString("en-US", { maximumFractionDigits: v % 1 ? 2 : 0 })}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-19" → "19 Nov". */
export function shortDate(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : date;
}

const clip = (s: string, n = LIMITS.name) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * {product}, {price}, {form} in ad text, and from Lingo Feeder's product knowledge (lingo_feeder.products):
 * {details} = the full description, {about} = the short description.
 */
export function fillCopy(text: string, product: { name: string; form_name?: string; price?: number | null; details?: string | null; about?: string | null }, currency = "LKR") {
  return text
    .replace(/\{details\}/gi, product.details || product.about || product.name)
    .replace(/\{about\}/gi, product.about || product.name)
    .replace(/\{product\}/gi, product.name)
    .replace(/\{form\}/gi, product.form_name || product.name)
    .replace(/\{price\}/gi, product.price != null ? money(product.price, currency) : "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** The text TikTok shows (its own, or the main text when short enough). */
export const tiktokText = (copy: Copy) => (copy.tiktok_text.trim() || copy.primary_text.trim());

/** The main budget number a launch can change (campaign amount, or each ad set's / the shared amount). */
export function mainBudget(s: Structure): number | null {
  return s.budget.level === "adset" && s.budget.adset_split === "fixed" ? s.budget.adset_amount : s.budget.amount;
}

/** Template + allowed launch changes → the snapshot frozen with the launch. Unallowed changes are ignored, with a warning. */
export function applyOverrides(t: TemplateData, o: Overrides): { template: TemplateData; warnings: Issue[] } {
  const warnings: Issue[] = [];
  const next: TemplateData = JSON.parse(JSON.stringify(t));
  const allowed = (k: Override, field: string) => {
    if (t.overridable.includes(k)) return true;
    warnings.push({ field, message: `This template doesn't allow changing the ${k === "copy" ? "ad text" : k} at launch, so the template's value is used.` });
    return false;
  };
  const boost = (base: number | null, wanted: number, field: string) => {
    if (base == null || base <= 0) return wanted;
    const max = base * (1 + t.structure.budget.boost_pct_max / 100);
    if (wanted > max + 0.001) {
      warnings.push({ field, message: `The budget can go up by at most ${t.structure.budget.boost_pct_max}% at launch (${money(max)}), so ${money(max)} is used.` });
      return Math.floor(max);
    }
    return wanted;
  };
  if (o.budget != null && o.budget > 0 && o.budget !== mainBudget(t.structure) && allowed("budget", "budget")) {
    const b = next.structure.budget;
    if (b.level === "adset" && b.adset_split === "fixed") b.adset_amount = boost(t.structure.budget.adset_amount, o.budget, "budget");
    else b.amount = boost(t.structure.budget.amount, o.budget, "budget");
  }
  if (o.tiktok_budget != null && o.tiktok_budget > 0 && allowed("budget", "tiktok_budget")) {
    const tb = next.structure.tiktok_budget;
    const fixedAdset = next.structure.budget.level === "adset" && next.structure.budget.adset_split === "fixed";
    const base = fixedAdset ? (t.structure.tiktok_budget.adset_amount ?? t.structure.budget.adset_amount) : (t.structure.tiktok_budget.amount ?? t.structure.budget.amount);
    const v = boost(base, o.tiktok_budget, "tiktok_budget");
    if (fixedAdset) tb.adset_amount = v;
    else tb.amount = v;
  }
  if (o.start && o.start !== t.schedule.start && allowed("start", "start")) {
    next.schedule.start = o.start;
    next.schedule.hours = o.start === "in_hours" ? (o.start_hours ?? t.schedule.hours ?? 1) : null;
  }
  if (o.copy && allowed("copy", "copy")) {
    for (const k of ["primary_text", "headline", "description", "tiktok_text"] as const) {
      const v = o.copy[k];
      if (typeof v === "string" && v.trim()) next.copy[k] = v.trim();
    }
    if (typeof o.copy.cta === "string" && CTAS[t.objective].some((c) => c.value === o.copy!.cta)) next.copy.cta = o.copy.cta;
  }
  return { template: next, warnings };
}

// ---------------------------------------------------------------------------
// Budgets: platform minimums (approximate, in US dollars; the platform has the last word)
// ---------------------------------------------------------------------------

/** About how many units of a currency make one US dollar (for minimum-budget checks only). */
const PER_USD: Record<string, number> = { USD: 1, LKR: 290, INR: 83, MVR: 15.4, AED: 3.67, QAR: 3.64, SAR: 3.75, KWD: 0.3, EUR: 0.9, GBP: 0.78, AUD: 1.5 };
const MIN_USD = { meta: { campaign: 1, adset: 1 }, tiktok: { campaign: 50, adset: 20 } } as const;

export function minDaily(platform: Platform, level: "campaign" | "adset", currency: string): number | null {
  const rate = PER_USD[currency];
  if (!rate) return null;
  const v = MIN_USD[platform][level] * rate;
  return v >= 100 ? Math.floor(v / 10) * 10 : Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// The compiler
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const groupLabel = (p: Platform, many = false) => (p === "tiktok" ? (many ? "ad groups" : "ad group") : many ? "ad sets" : "ad set");

/** Checks that don't depend on the creatives (also used when a template is saved). */
export function checkTemplate(t: TemplateData): { errors: Issue[]; warnings: Issue[] } {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const s = t.structure;
  if (!t.platforms.length) errors.push({ field: "platforms", message: "Pick Meta, TikTok or both." });
  if (t.platforms.includes("tiktok") && !OBJECTIVES.find((o) => o.value === t.objective)?.tiktok) {
    errors.push({ field: "objective", platform: "tiktok", message: `${objectiveLabel(t.objective)} works on Meta only for now. Use Leads or Website visits for TikTok, or untick TikTok.` });
  }
  if (!t.audiences.length) errors.push({ field: "audiences", message: "Add at least one audience." });
  if ((s.adsets.split_by === "audience" || s.adsets.split_by === "audience_x_creative") && s.adsets.mode === "new" && t.audiences.length < 2) {
    errors.push({ field: "audiences", message: "This layout makes an ad set per audience: add at least 2 audiences." });
  }
  t.audiences.forEach((a, i) => {
    const f = `audiences.${i}`;
    if (!a.countries.length) errors.push({ field: `${f}.countries`, message: `${a.name}: pick at least one country.` });
    if (a.mode === "ai") {
      if (t.platforms.includes("meta") && (a.age_min < 18 || a.age_min > 25)) {
        errors.push({ field: `${f}.age_min`, platform: "meta", message: `${a.name}: with the AI audience the minimum age can be 18–25. Put older ages in "Ages you prefer" (a suggestion), or switch to Manual for a strict age.` });
      }
      if (a.suggest_age && (a.suggest_age[0] >= a.suggest_age[1] || a.suggest_age[0] < 18 || a.suggest_age[1] > 65)) {
        errors.push({ field: `${f}.suggest_age`, message: `${a.name}: preferred ages must be between 18 and 65, lowest first.` });
      }
      if (a.genders !== "all") warnings.push({ field: `${f}.genders`, message: `${a.name}: in AI mode the gender is only a suggestion. Use Manual if you need only ${a.genders === "male" ? "men" : "women"}.` });
    } else if (a.age_min >= a.age_max) {
      errors.push({ field: `${f}.age_max`, message: `${a.name}: the oldest age must be above the youngest.` });
    }
  });
  if (s.campaign.mode === "existing" || s.adsets.mode === "existing") {
    for (const p of t.platforms) {
      const id = s.adsets.mode === "existing" ? s.adsets.existing_id[p] : s.campaign.existing_id[p];
      if (!id) errors.push({ field: s.adsets.mode === "existing" ? `structure.adsets.existing_id.${p}` : `structure.campaign.existing_id.${p}`, platform: p, message: `Enter the ${PLATFORM_LABEL[p]} ${s.adsets.mode === "existing" ? groupLabel(p) : "campaign"} ID to add to.` });
    }
  }
  if (s.adsets.mode === "existing" && s.adsets.split_by !== "none") errors.push({ field: "structure.adsets.split_by", message: "When adding ads to an existing ad set there is only one ad set." });
  if (s.campaign.mode === "slot" && s.campaign.per === "creative") errors.push({ field: "structure.campaign.per", message: "An evergreen campaign is one campaign; it can't be one per creative." });
  if (s.budget.type === "lifetime" && !(t.schedule.duration_days && t.schedule.duration_days > 0)) {
    errors.push({ field: "schedule.duration_days", message: "A lifetime budget needs an end: set how many days the ads run." });
  }
  if (s.budget.type === "lifetime" && s.campaign.mode === "slot") errors.push({ field: "structure.budget.type", message: "Evergreen campaigns keep running, so they use a daily budget." });
  const usesCampaignBudget = s.budget.level === "campaign" && s.campaign.mode !== "existing" && s.adsets.mode === "new";
  const usesAdsetBudget = s.budget.level === "adset" && s.adsets.mode === "new";
  if (usesCampaignBudget && !(s.budget.amount && s.budget.amount > 0)) errors.push({ field: "structure.budget.amount", message: "Enter the campaign budget." });
  if (usesAdsetBudget && s.budget.adset_split === "fixed" && !(s.budget.adset_amount && s.budget.adset_amount > 0)) errors.push({ field: "structure.budget.adset_amount", message: "Enter the budget for each ad set." });
  if (usesAdsetBudget && s.budget.adset_split === "divide" && !(s.budget.amount && s.budget.amount > 0)) errors.push({ field: "structure.budget.amount", message: "Enter the budget to share between the ad sets." });
  if (t.schedule.start === "in_hours" && !(t.schedule.hours && t.schedule.hours >= 1 && t.schedule.hours <= 720)) errors.push({ field: "schedule.hours", message: "Start in 1 to 720 hours." });
  if (t.schedule.duration_days != null && (t.schedule.duration_days < 1 || t.schedule.duration_days > 365)) errors.push({ field: "schedule.duration_days", message: "Run for 1 to 365 days, or leave it empty to keep running." });

  // Ad text
  const c = t.copy;
  if (!c.primary_text.trim()) errors.push({ field: "copy.primary_text", message: "Write the ad text." });
  if (c.primary_text.length > LIMITS.primary_text) errors.push({ field: "copy.primary_text", message: `The ad text can be at most ${LIMITS.primary_text} characters.` });
  if (c.headline.length > LIMITS.headline) errors.push({ field: "copy.headline", message: `The headline can be at most ${LIMITS.headline} characters.` });
  if (c.description.length > LIMITS.description) errors.push({ field: "copy.description", message: `The description can be at most ${LIMITS.description} characters.` });
  if (t.platforms.includes("tiktok")) {
    const tt = tiktokText(c);
    if (!tt) errors.push({ field: "copy.tiktok_text", platform: "tiktok", message: "Write the TikTok ad text." });
    else if (tt.replace(/\{product\}/gi, "").length > LIMITS.tiktok_text) errors.push({ field: "copy.tiktok_text", platform: "tiktok", message: `TikTok ad text can be at most ${LIMITS.tiktok_text} characters: write a short TikTok text.` });
  }
  if (t.objective !== "messages" && !CTAS[t.objective].some((x) => x.value === c.cta)) errors.push({ field: "copy.cta", message: "Pick the button." });
  if (c.primary_text.length > 300) warnings.push({ field: "copy.primary_text", message: "Long text is cut after about 125 characters in the feed; put the key message first." });

  // Destination
  if ((t.objective === "traffic" || t.objective === "sales") && !/^https:\/\/[^\s]+\.[^\s]{2,}$/.test(t.destination.url.trim())) {
    errors.push({ field: "destination.url", message: "Enter the website link (https://…)." });
  }
  if (t.target_cost_per_result != null && t.target_cost_per_result <= 0) errors.push({ field: "target_cost_per_result", message: "The target cost must be above 0." });
  return { errors, warnings };
}

/** Template + creatives + product → the plan tree for each platform, with counts, totals, a summary and warnings. */
export function compile(input: CompileInput): CompileResult {
  const { template: t, product, currency } = input;
  const s = t.structure;
  const { errors, warnings } = checkTemplate(t);
  const creatives = [...input.creatives].filter((c) => c.approved !== false).sort((a, b) => a.position - b.position);
  const F = clip(product.form_name.trim() || product.name.trim(), 80);
  const D = shortDate(input.date);
  if (!creatives.length) errors.push({ field: "creatives", message: "Add at least one video or image." });
  if (input.creatives.length > MAX_CREATIVES) errors.push({ field: "creatives", message: `Up to ${MAX_CREATIVES} creatives in one launch.` });
  if (s.preset === "single" && creatives.length !== 1) errors.push({ field: "creatives", message: `The "Single ad" template takes exactly 1 creative (you added ${creatives.length}). Use "One ad set, many ads" for more.` });
  if (!F) errors.push({ field: "product", message: "Pick the product." });

  const nodes: PlanNode[] = [];
  const platforms: PlatformPlan[] = [];

  for (const p of t.platforms) {
    let usable = creatives;
    if (p === "tiktok") {
      const images = creatives.filter((c) => c.kind === "image");
      if (images.length) {
        if (t.image_on_tiktok === "reject") errors.push({ field: "creatives", platform: p, message: `TikTok ads here are videos only: remove image ${images.map((i) => `#${i.position}`).join(", ")}, or set the template to skip images on TikTok.` });
        else warnings.push({ field: "creatives", platform: p, message: `TikTok ads here are videos only: image ${images.map((i) => `#${i.position}`).join(", ")} ${images.length === 1 ? "goes" : "go"} to Meta only.` });
        usable = creatives.filter((c) => c.kind === "video");
      }
    }
    const plan: PlatformPlan = { platform: p, skipped: null, counts: { campaigns: 0, adsets: 0, ads: 0, media: 0 }, daily: 0, summary: "" };
    platforms.push(plan);
    if (!usable.length) {
      plan.skipped = creatives.length ? "no videos" : "no creatives";
      plan.summary = `${PLATFORM_LABEL[p]}: nothing (${plan.skipped})`;
      continue;
    }
    const positions = usable.map((c) => c.position);
    const nameOf = (pos: number) => usable.find((c) => c.position === pos)?.name ?? `#${pos}`;
    const add = (n: Omit<PlanNode, "platform">) => {
      nodes.push({ platform: p, ...n });
      return n.key;
    };

    // Media once per creative.
    for (const pos of positions) {
      add({ key: `m${pos}`, level: "media", parent_key: null, depends_on: [], action: "create", existing_id: null, creative_positions: [pos], audience_index: null, name: clip(nameOf(pos)), budget_daily: null, budget_lifetime: null });
      plan.counts.media++;
    }
    // The lead form: named exactly after the product's form name.
    const form = t.objective === "leads" ? add({ key: "f1", level: "form", parent_key: null, depends_on: [], action: p === "meta" && t.destination.lead_form.mode === "product" ? "create" : "reuse", existing_id: null, creative_positions: positions, audience_index: null, name: F, budget_daily: null, budget_lifetime: null }) : null;
    // Meta creatives: one per creative, used by every ad that shows it.
    if (p === "meta") {
      for (const pos of positions) {
        add({ key: `k${pos}`, level: "creative", parent_key: null, depends_on: [`m${pos}`, ...(form ? [form] : [])], action: "create", existing_id: null, creative_positions: [pos], audience_index: null, name: clip(`${F} · #${pos} ${nameOf(pos)}`), budget_daily: null, budget_lifetime: null });
      }
    }

    // Budgets for this platform.
    const amount = p === "tiktok" ? (s.tiktok_budget.amount ?? s.budget.amount) : s.budget.amount;
    const adsetAmount = p === "tiktok" ? (s.tiktok_budget.adset_amount ?? s.budget.adset_amount) : s.budget.adset_amount;
    const days = s.budget.type === "lifetime" ? Math.max(1, t.schedule.duration_days ?? 1) : 1;
    const budgetNode = (v: number | null) => (v == null ? { budget_daily: null, budget_lifetime: null } : s.budget.type === "lifetime" ? { budget_daily: null, budget_lifetime: v } : { budget_daily: v, budget_lifetime: null });
    const dailyOf = (n: { budget_daily: number | null; budget_lifetime: number | null }) => n.budget_daily ?? (n.budget_lifetime != null ? n.budget_lifetime / days : 0);

    // Campaigns: which creatives each one holds.
    type Camp = { key: string | null; positions: number[] };
    const camps: Camp[] = [];
    if (s.adsets.mode === "existing") {
      camps.push({ key: null, positions });
    } else if (s.campaign.mode === "existing") {
      camps.push({ key: add({ key: "c1", level: "campaign", parent_key: null, depends_on: [], action: "reuse", existing_id: s.campaign.existing_id[p], creative_positions: positions, audience_index: null, name: "Existing campaign", budget_daily: null, budget_lifetime: null }), positions });
    } else if (s.campaign.mode === "slot") {
      const b = s.budget.level === "campaign" ? budgetNode(amount) : budgetNode(null);
      camps.push({ key: add({ key: "c1", level: "campaign", parent_key: null, depends_on: [], action: "slot", existing_id: null, creative_positions: positions, audience_index: null, name: clip(`${F} · evergreen`), ...b }), positions });
    } else if (s.campaign.per === "creative") {
      positions.forEach((pos, i) => {
        const b = s.budget.level === "campaign" ? budgetNode(amount) : budgetNode(null);
        camps.push({ key: add({ key: `c${i + 1}`, level: "campaign", parent_key: null, depends_on: [], action: "create", existing_id: null, creative_positions: [pos], audience_index: null, name: clip(`${F} · #${pos} ${nameOf(pos)} · ${D}`), ...b }), positions: [pos] });
      });
    } else {
      const b = s.budget.level === "campaign" ? budgetNode(amount) : budgetNode(null);
      camps.push({ key: add({ key: "c1", level: "campaign", parent_key: null, depends_on: [], action: "create", existing_id: null, creative_positions: positions, audience_index: null, name: clip(`${F} · ${D}`), ...b }), positions });
    }
    plan.counts.campaigns = camps.filter((c) => c.key).length;

    // Ad sets per campaign, then ads.
    camps.forEach((camp) => {
      type Group = { audience: number; positions: number[]; suffix: string };
      let sets: Group[];
      if (s.adsets.mode === "existing") sets = [{ audience: 0, positions: camp.positions, suffix: "" }];
      else if (s.adsets.split_by === "creative") sets = camp.positions.map((pos) => ({ audience: 0, positions: [pos], suffix: ` · #${pos}` }));
      else if (s.adsets.split_by === "audience") sets = t.audiences.map((_, a) => ({ audience: a, positions: camp.positions, suffix: "" }));
      else if (s.adsets.split_by === "audience_x_creative") sets = t.audiences.flatMap((_, a) => camp.positions.map((pos) => ({ audience: a, positions: [pos], suffix: ` · #${pos}` })));
      else sets = [{ audience: 0, positions: camp.positions, suffix: "" }];

      const campNode = camp.key ? nodes.find((n) => n.platform === p && n.key === camp.key)! : null;
      sets.forEach((set, j) => {
        const key = camp.key ? `${camp.key}.s${j + 1}` : `s${j + 1}`;
        const aud = t.audiences[set.audience] ?? t.audiences[0]!;
        let b = budgetNode(null);
        if (s.adsets.mode === "new" && s.budget.level === "adset") b = budgetNode(s.budget.adset_split === "divide" ? (amount != null ? Math.floor((amount / sets.length) * 100) / 100 : null) : adsetAmount);
        add({
          key,
          level: "adset",
          parent_key: camp.key,
          depends_on: camp.key ? [camp.key] : [],
          action: s.adsets.mode === "existing" ? "reuse" : "create",
          existing_id: s.adsets.mode === "existing" ? s.adsets.existing_id[p] : null,
          creative_positions: set.positions,
          audience_index: set.audience,
          name: s.adsets.mode === "existing" ? `Existing ${groupLabel(p)}` : clip(`${F} · ${aud.name}${set.suffix} · ${D}`),
          ...b,
        });
        for (const pos of set.positions) {
          add({
            key: `${key}.a${pos}`,
            level: "ad",
            parent_key: key,
            depends_on: [key, p === "meta" ? `k${pos}` : `m${pos}`, ...(p === "tiktok" && form ? [form] : [])],
            action: "create",
            existing_id: null,
            creative_positions: [pos],
            audience_index: set.audience,
            name: clip(`${F} · #${pos} ${nameOf(pos)}`),
            budget_daily: null,
            budget_lifetime: null,
          });
          plan.counts.ads++;
        }
        plan.counts.adsets++;
        if (set.positions.length > MAX_ADS_PER_ADSET) errors.push({ field: "structure", platform: p, message: `An ${groupLabel(p)} can hold at most ${MAX_ADS_PER_ADSET} ads.` });
      });
      if (campNode) campNode.creative_positions = camp.positions;
    });

    // Totals, minimums and advice.
    const holders = nodes.filter((n) => n.platform === p && (n.budget_daily != null || n.budget_lifetime != null));
    plan.daily = Math.round(holders.reduce((sum, n) => sum + dailyOf(n), 0) * 100) / 100;
    if (plan.counts.adsets > MAX_ADSETS_PER_LAUNCH) errors.push({ field: "structure", platform: p, message: `This makes ${plan.counts.adsets} ${groupLabel(p, true)}; one launch can make at most ${MAX_ADSETS_PER_LAUNCH}. Use fewer audiences or creatives.` });
    for (const n of holders) {
      const lvl = n.level === "campaign" ? "campaign" : "adset";
      const min = minDaily(p, lvl, currency);
      if (min != null && dailyOf(n) + 0.001 < min) {
        errors.push({ field: p === "tiktok" && (s.tiktok_budget.amount != null || s.tiktok_budget.adset_amount != null) ? "tiktok_budget" : "budget", platform: p, message: `${PLATFORM_LABEL[p]} needs at least about ${money(min, currency)} a day for each ${lvl === "campaign" ? "campaign" : groupLabel(p)}; this ${lvl === "campaign" ? "campaign" : groupLabel(p)} gets ${money(dailyOf(n), currency)}.` });
        break;
      }
    }
    if (t.target_cost_per_result) {
      const need = (50 * t.target_cost_per_result) / 7;
      const groups = nodes.filter((n) => n.platform === p && n.level === "adset");
      const per = groups.map((g) => {
        if (g.budget_daily != null || g.budget_lifetime != null) return dailyOf(g);
        const parent = nodes.find((n) => n.platform === p && n.key === g.parent_key);
        const siblings = groups.filter((x) => x.parent_key === g.parent_key).length || 1;
        return parent && (parent.budget_daily != null || parent.budget_lifetime != null) ? dailyOf(parent) / siblings : null;
      });
      const thin = per.filter((v): v is number => v != null && v < need);
      if (thin.length) {
        warnings.push({ field: "budget", platform: p, message: `${PLATFORM_LABEL[p]}: each ${groupLabel(p)} gets about ${money(Math.min(...thin), currency)} a day. At ${money(t.target_cost_per_result, currency)} a result it probably can't leave the learning phase (about 50 results a week). Fewer ${groupLabel(p, true)} or a higher budget would help.` });
      }
    }
    if (s.campaign.mode === "slot") warnings.push({ field: "structure", platform: p, message: `${PLATFORM_LABEL[p]}: the evergreen campaign for ${F} is made on the first launch and kept after that${s.budget.level === "campaign" ? "; it keeps the budget it was made with" : ""}.` });
    if (s.adsets.mode === "existing") warnings.push({ field: "structure", platform: p, message: `${PLATFORM_LABEL[p]}: adding ads to an ad set that is doing well can restart its learning.` });

    const budgetText = plan.daily > 0 ? `${money(plan.daily, currency)}/day` : s.campaign.mode === "existing" || s.adsets.mode === "existing" ? "its own budget" : "no budget";
    plan.summary = `${PLATFORM_LABEL[p]}: ${plan.counts.campaigns ? plural(plan.counts.campaigns, s.campaign.mode === "existing" ? "existing campaign" : s.campaign.mode === "slot" ? "evergreen campaign" : "campaign") : "existing campaign"} · ${plural(plan.counts.adsets, s.adsets.mode === "existing" ? `existing ${groupLabel(p)}` : groupLabel(p), s.adsets.mode === "existing" ? `existing ${groupLabel(p, true)}` : groupLabel(p, true))} · ${plural(plan.counts.ads, "ad")} · ${budgetText}`;
  }

  return { nodes, platforms, summary: platforms.map((x) => x.summary).join(" · "), errors: dedupe(errors), warnings: dedupe(warnings) };
}

function dedupe(list: Issue[]) {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.platform ?? ""}|${i.field}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** What a template makes with 1, 3 and 10 creatives (shown in the editor). */
export function sampleSummaries(t: TemplateData, currency: string) {
  return [1, 3, 10].map((n) => {
    const r = compile({
      template: t,
      creatives: Array.from({ length: n }, (_, i) => ({ position: i + 1, kind: "video" as const, name: `Video ${i + 1}` })),
      product: { name: "Product", form_name: "Product" },
      currency,
      date: "2026-01-01",
    });
    return { creatives: n, summary: r.summary, errors: r.errors };
  });
}

/** Approval: creatives the approver left out → every node built only from them is skipped (empty ad sets and campaigns too). */
export function skippedKeys(nodes: Pick<PlanNode, "platform" | "key" | "level" | "parent_key" | "creative_positions">[], approved: number[]) {
  const ok = new Set(approved);
  const skip = new Set<string>();
  const id = (n: { platform: Platform; key: string }) => `${n.platform}:${n.key}`;
  for (const n of nodes) if (n.creative_positions.length && n.creative_positions.every((p) => !ok.has(p))) skip.add(id(n));
  // Parents whose children are all skipped.
  for (const level of ["adset", "campaign"] as const) {
    for (const n of nodes.filter((x) => x.level === level)) {
      const kids = nodes.filter((x) => x.platform === n.platform && x.parent_key === n.key);
      if (kids.length && kids.every((k) => skip.has(id(k)))) skip.add(id(n));
    }
  }
  return skip;
}
