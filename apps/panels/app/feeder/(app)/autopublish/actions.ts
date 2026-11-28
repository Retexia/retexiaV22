"use server";

import { randomInt, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { AccessError, dbMessage, run, type ActionResult } from "@/lib/action";
import { autopublishUser, getAccount, getTemplate, launchProducts } from "@/lib/feeder/autopublish/data";
import { gateway, gatewayReady } from "@/lib/feeder/autopublish/gateway";
import { buildCreative, metaCheck, metaInterests } from "@/lib/feeder/autopublish/meta";
import { logEvent, notifyLaunch } from "@/lib/feeder/autopublish/notify";
import {
  applyOverrides,
  checkTemplate,
  compile,
  money,
  PLATFORM_LABEL,
  readTemplate,
  sampleSummaries,
  skippedKeys,
  type Issue,
  type Platform,
} from "@/lib/feeder/autopublish/plan";
import { accountReady, activeSpend, BUCKET, deriveState, loadCtx, MAX_RESUBMITS, retryLaunch, runTick, setLaunchRunning } from "@/lib/feeder/autopublish/runner";
import { nameKey } from "@/lib/feeder/autopublish/step";
import { tiktokCheck } from "@/lib/feeder/autopublish/tiktok";
import type { AccountRow, LaunchRow, NodeRow, Snapshot } from "@/lib/feeder/autopublish/types";
import { feederDb } from "@/lib/feeder/db";
import { metaReachable } from "@/lib/feeder/meta-connection";
import { refresh } from "@/lib/feeder/meta-portfolio";
import { adsConnectionUser } from "@/lib/feeder/shared";
import { addDays, localDate, zonedToUtc } from "@/lib/time";

const done = <T,>(message: string, data?: T): ActionResult<T> => {
  revalidatePath("/", "layout");
  return { ok: true, message, data };
};

async function user() {
  const u = await autopublishUser();
  if (!u) throw new AccessError("Please sign in again.");
  return u;
}

/** Ad accounts (Connections) are shared by Autopublish and Auto comment: owners of either may change them. */
async function connectionUser() {
  const u = await adsConnectionUser();
  if (!u) throw new AccessError("Please sign in again.");
  return u;
}

/** Their Feeder row (products and form names hang off it), made on first use. */
async function ensureCustomer(u: { id: string; name: string }) {
  const db = feederDb();
  const { data } = await db.from("customers").select("user_id").eq("user_id", u.id).maybeSingle();
  if (!data) await db.from("customers").insert({ user_id: u.id, name: u.name || null });
}

const issuesToFields = (list: Issue[]) => Object.fromEntries(list.map((i) => [i.field, i.message]));
const failWith = <T,>(errors: Issue[]): ActionResult<T> => ({ ok: false, message: errors[0]?.message ?? "Please check the highlighted fields.", fieldErrors: issuesToFields(errors) });

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const optId = (label: string) =>
  z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.replace(/^act_/i, "").replace(/\s+/g, ""))
    .refine((v) => v === "" || /^\d{5,25}$/.test(v), `${label}: numbers only (copy it from Ads Manager)`)
    .transform((v) => v || null);
const phone = z
  .string()
  .trim()
  .max(20)
  .transform((v) => {
    let d = v.replace(/\D/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("0")) d = `94${d.slice(1)}`;
    else if (d.length === 9) d = `94${d}`;
    return d;
  })
  .refine((v) => v === "" || /^\d{9,15}$/.test(v), "Phone numbers with the country code, e.g. 94771234567");

const accountInput = z.object({
  meta_ad_account_id: optId("Ad account ID"),
  meta_page_id: optId("Page ID"),
  meta_instagram_id: optId("Instagram account ID"),
  meta_pixel_id: optId("Pixel ID"),
  meta_whatsapp: phone.transform((v) => v || null),
  tiktok_advertiser_id: optId("TikTok advertiser ID"),
  tiktok_identity: z.string().trim().max(140).default(""),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Three letters, e.g. LKR"),
  timezone: z.string().trim().min(3).max(60),
  max_daily_spend: z.number().positive().max(100_000_000).nullable(),
  privacy_policy_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/[^\s]+\.[^\s]{2,}$/.test(v), "A link starting with https://")
    .transform((v) => v || null),
  approval_required: z.boolean(),
  approver_whatsapp: z.array(phone).max(5).transform((l) => [...new Set(l.filter(Boolean))]),
  notify_whatsapp: z.array(phone).max(5).transform((l) => [...new Set(l.filter(Boolean))]),
});

/** Saves the ad account settings. New or changed IDs wait for Retexia to confirm the access (admin → Feeder → Ad accounts). */
export async function saveAccount(input: z.input<typeof accountInput>): Promise<ActionResult<{ meta?: AccountRow["meta_info"]; tiktok?: AccountRow["tiktok_info"] }>> {
  return run(async () => {
    const u = await connectionUser();
    const d = accountInput.parse(input);
    const own = (await getAccount(u.id))?.meta_via === "token";
    if (own) {
      // With their own Business portfolio, the ad account and Page are chosen in Connections → Facebook.
      const cur = (await getAccount(u.id))!;
      d.meta_ad_account_id = cur.meta_ad_account_id;
      d.meta_page_id = cur.meta_page_id;
      d.meta_instagram_id = cur.meta_instagram_id;
    }
    if (d.meta_ad_account_id && !d.meta_page_id) return { ok: false, message: "Add the Facebook Page ID too.", fieldErrors: { meta_page_id: "Needed with the ad account" } };
    try {
      Intl.DateTimeFormat("en", { timeZone: d.timezone });
    } catch {
      return { ok: false, message: "Unknown time zone.", fieldErrors: { timezone: "e.g. Asia/Colombo" } };
    }
    const [identityType, identityId] = d.tiktok_identity.includes(":") ? d.tiktok_identity.split(/:(.*)/s) : [null, null];
    const before = await getAccount(u.id);
    const row = {
      user_id: u.id,
      meta_ad_account_id: d.meta_ad_account_id,
      meta_page_id: d.meta_page_id,
      meta_instagram_id: d.meta_instagram_id,
      meta_pixel_id: d.meta_pixel_id,
      meta_whatsapp: d.meta_whatsapp,
      tiktok_advertiser_id: d.tiktok_advertiser_id,
      tiktok_identity_id: identityId || null,
      tiktok_identity_type: identityType && ["TT_USER", "BC_AUTH_TT", "CUSTOMIZED_USER", "AUTH_CODE"].includes(identityType) ? identityType : null,
      currency: d.currency,
      timezone: d.timezone,
      max_daily_spend: d.max_daily_spend,
      privacy_policy_url: d.privacy_policy_url,
      approval_required: d.approval_required,
      approver_whatsapp: d.approver_whatsapp,
      notify_whatsapp: d.notify_whatsapp,
    };
    const db = feederDb();
    const { error } = before ? await db.from("ad_accounts").update(row).eq("user_id", u.id) : await db.from("ad_accounts").insert(row);
    if (error) {
      if (error.code === "23505") return { ok: false, message: "This ad account is already connected to another Retexia account. Talk to us if it's yours." };
      return { ok: false, message: dbMessage(error) };
    }
    // Look the new / changed accounts up straight away (best effort).
    const out: { meta?: AccountRow["meta_info"]; tiktok?: AccountRow["tiktok_info"] } = {};
    const metaChanged = d.meta_ad_account_id && (!before || before.meta_ad_account_id !== d.meta_ad_account_id || before.meta_page_id !== d.meta_page_id || before.meta_instagram_id !== d.meta_instagram_id || before.meta_pixel_id !== d.meta_pixel_id || !before.meta_info?.checked_at);
    const ttChanged = d.tiktok_advertiser_id && (!before || before.tiktok_advertiser_id !== d.tiktok_advertiser_id || !before.tiktok_info?.checked_at);
    if (await metaReachable(u.id, gatewayReady())) {
      if (metaChanged) out.meta = (await runCheck(u.id, "meta")).info;
      if (ttChanged) out.tiktok = (await runCheck(u.id, "tiktok")).info;
    }
    if (d.meta_ad_account_id || d.tiktok_advertiser_id) {
      await logEvent({ userId: u.id, ref: null, type: "account.saved", actor: "customer", message: `Ad accounts saved${metaChanged || ttChanged ? " (waiting for Retexia to confirm access)" : ""}.` });
    }
    return done("Saved", out);
  });
}

async function runCheck(userId: string, platform: Platform) {
  const a = await getAccount(userId);
  if (!a) return { ok: false, info: { problems: ["Save your account first."] } };
  if (platform === "meta" && a.meta_via === "token") {
    // Their own Business portfolio: look it up again with their token.
    await refresh(userId);
    const after = await getAccount(userId);
    return { ok: after?.meta_status === "connected", info: (after?.meta_info ?? {}) as Record<string, unknown> };
  }
  const r = platform === "meta" ? await metaCheck(a) : await tiktokCheck(a.tiktok_advertiser_id);
  const patch: Record<string, unknown> = platform === "meta" ? { meta_info: r.info } : { tiktok_info: r.info };
  // The account's currency and time zone come from Meta (or TikTok) once known.
  const info = r.info as { currency?: string; timezone?: string };
  if (info.currency && /^[A-Z]{3}$/.test(info.currency) && (platform === "meta" || !a.meta_info?.currency)) patch.currency = info.currency;
  if (info.timezone && (platform === "meta" || !a.meta_info?.timezone)) {
    try {
      Intl.DateTimeFormat("en", { timeZone: info.timezone });
      patch.timezone = info.timezone;
    } catch {
      /* keep ours */
    }
  }
  await feederDb().from("ad_accounts").update(patch).eq("user_id", userId);
  return r;
}

/** "Check again": looks the account up on Meta or TikTok (pages, forms, identities) and saves what it found. */
export async function checkAccount(input: { platform: Platform }): Promise<ActionResult<{ ok: boolean; info: Record<string, unknown> }>> {
  return run(async () => {
    const u = await connectionUser();
    const platform = z.enum(["meta", "tiktok"]).parse(input.platform);
    if (!(await metaReachable(u.id, gatewayReady()))) return { ok: false, message: "Autopublish is being set up by Retexia. Try again later." };
    const r = await runCheck(u.id, platform);
    return done(r.ok ? "Everything Retexia needs is there" : "Some things still need doing", { ok: r.ok, info: r.info as Record<string, unknown> });
  });
}

/** Meta interest search (real interest IDs, with audience sizes). */
export async function searchInterests(input: { q: string }): Promise<ActionResult<{ id: string; name: string; size: number | null; path: string }[]>> {
  return run(async () => {
    const u = await user();
    const q = z.string().trim().min(2, "Type at least 2 letters").max(60).parse(input.q);
    if (!(await metaReachable(u.id, gatewayReady()))) return { ok: false, message: "Interest search isn't available yet." };
    return { ok: true, data: await metaInterests(q) };
  });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** Saves a template after the deep checks (structure with 1, 3 and 10 creatives, audiences, copy, destination). */
export async function saveTemplate(input: { id?: string | null; data: unknown; is_active?: boolean }): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const u = await user();
    if (JSON.stringify(input.data ?? {}).length > 60_000) return { ok: false, message: "This template is too big." };
    const t = readTemplate((input.data ?? {}) as Record<string, unknown>);
    t.name = t.name.trim().slice(0, 80);
    if (!t.name) return { ok: false, message: "Give the template a name.", fieldErrors: { name: "Required" } };
    const { errors, warnings } = checkTemplate(t);
    const account = await getAccount(u.id);
    const currency = account?.currency ?? "LKR";
    const samples = sampleSummaries(t, currency);
    for (const s of samples) for (const e of s.errors) if (!/creative/.test(e.field) && !errors.some((x) => x.message === e.message)) errors.push(e);
    if (errors.length) return failWith(errors);
    // Account checks (warnings: the account can be finished before launching).
    for (const p of t.platforms) if (!accountReady(account, p)) warnings.push({ field: "platforms", platform: p, message: `${PLATFORM_LABEL[p]} isn't connected yet: finish Accounts before launching.` });
    if (t.objective === "messages" && t.destination.message_app === "whatsapp" && !account?.meta_whatsapp) warnings.push({ field: "destination.message_app", message: "Add the WhatsApp number linked to your Page in Accounts." });
    if (t.objective === "sales" && !account?.meta_pixel_id) warnings.push({ field: "destination.pixel_event", message: "Add your Meta Pixel ID in Accounts before launching." });
    if (t.objective === "leads" && t.platforms.includes("meta") && t.destination.lead_form.mode === "product" && !account?.privacy_policy_url) {
      warnings.push({ field: "destination.lead_form", message: "Add your privacy policy link in Accounts so Retexia can make lead forms (or have forms named after your products on your Page already)." });
    }
    const row = {
      name: t.name,
      platforms: t.platforms,
      objective: t.objective,
      structure: t.structure,
      audiences: t.audiences,
      schedule: t.schedule,
      copy: t.copy,
      destination: t.destination,
      target_cost_per_result: t.target_cost_per_result,
      require_approval: t.require_approval,
      launch_as: t.launch_as,
      image_on_tiktok: t.image_on_tiktok,
      overridable: t.overridable,
      is_active: input.is_active ?? true,
      validation: { errors: [], warnings, samples: samples.map((s) => ({ creatives: s.creatives, summary: s.summary })) },
      last_validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const db = feederDb();
    if (input.id) {
      const id = z.uuid().parse(input.id);
      const { data: cur } = await db.from("ad_templates").select("version").eq("id", id).eq("user_id", u.id).is("deleted_at", null).maybeSingle();
      if (!cur) return { ok: false, message: "That template doesn't exist any more." };
      const { error } = await db.from("ad_templates").update({ ...row, version: cur.version + 1 }).eq("id", id).eq("user_id", u.id);
      if (error) return { ok: false, message: dbMessage(error) };
      return done(warnings.length ? `Saved · ${warnings.length} thing${warnings.length === 1 ? "" : "s"} to check` : "Template saved", { id });
    }
    const { data, error } = await db.from("ad_templates").insert({ ...row, user_id: u.id }).select("id").single();
    if (error || !data) return { ok: false, message: dbMessage(error) };
    return done("Template saved", { id: data.id as string });
  });
}

export async function duplicateTemplate(input: { id: string }): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const u = await user();
    const t = await getTemplate(u.id, z.uuid().parse(input.id));
    if (!t) return { ok: false, message: "That template doesn't exist any more." };
    return saveTemplate({ data: { ...t.data, name: `${t.data.name} (copy)`.slice(0, 80) } });
  });
}

export async function deleteTemplate(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const u = await user();
    const { error } = await feederDb().from("ad_templates").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", z.uuid().parse(input.id)).eq("user_id", u.id);
    if (error) return { ok: false, message: dbMessage(error) };
    return done("Template deleted");
  });
}

// ---------------------------------------------------------------------------
// Uploads (straight to private Storage with a one-time signed link)
// ---------------------------------------------------------------------------

const MAX_BYTES = 200 * 1024 * 1024;
const TYPES: Record<string, "video" | "image"> = { "video/mp4": "video", "video/quicktime": "video", "image/jpeg": "image", "image/png": "image" };

export async function createUpload(input: { name: string; type: string; size: number }): Promise<ActionResult<{ path: string; token: string }>> {
  return run(async () => {
    const u = await user();
    const d = z.object({ name: z.string().min(1).max(200), type: z.string().max(60), size: z.number().int().positive() }).parse(input);
    if (!TYPES[d.type]) return { ok: false, message: `${d.name}: use an MP4 or MOV video, or a JPG or PNG image.` };
    if (d.size > MAX_BYTES) return { ok: false, message: `${d.name} is over 200 MB. Export a smaller file.` };
    const safe = d.name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-80) || "file";
    const path = `${u.id}/${randomUUID()}-${safe}`;
    const { data, error } = await feederDb().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, message: "Couldn't start the upload. Try again." };
    return { ok: true, data: { path: data.path ?? path, token: data.token } };
  });
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

const creativeInput = z.object({
  path: z.string().min(40).max(400),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["video", "image"]),
  mime: z.string().max(60),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  duration: z.number().nonnegative().nullable().optional(),
});
const formPick = z.object({ id: z.string().regex(/^\d{3,30}$/), name: z.string().trim().min(1).max(200) }).nullable().optional();
const launchInput = z.object({
  template_id: z.uuid(),
  product_id: z.number().int().positive(),
  form_name: z.string().trim().min(1, "Pick the form name").max(120),
  creatives: z.array(creativeInput).min(1, "Add at least one video or image").max(10, "Up to 10 creatives"),
  overrides: z
    .object({
      budget: z.number().positive().nullable().optional(),
      tiktok_budget: z.number().positive().nullable().optional(),
      start: z.enum(["immediate", "next_day", "in_hours"]).nullable().optional(),
      start_hours: z.number().int().min(1).max(720).nullable().optional(),
      copy: z.object({ primary_text: z.string().max(2200).optional(), headline: z.string().max(255).optional(), description: z.string().max(255).optional(), tiktok_text: z.string().max(100).optional(), cta: z.string().max(40).optional() }).nullable().optional(),
    })
    .default({}),
  meta_form: formPick,
  tiktok_form: formPick,
  /** One of the seller's portfolio ad accounts (Connections); empty = the default. */
  meta_ad_account_id: z.string().regex(/^\d{5,25}$/).nullable().optional(),
});

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = (n: number) => Array.from({ length: n }, () => REF_CHARS[randomInt(REF_CHARS.length)]).join("");

/** Adds a form name to the customer's product (Bulk create matches leads by it), unless another of their products uses it. */
async function addFormName(userId: string, productId: number, name: string): Promise<string | null> {
  const db = feederDb();
  const { data: rows } = await db.from("customer_products").select("product_id, form_names, products(product_name)").eq("user_id", userId);
  const list = (rows ?? []) as unknown as { product_id: number; form_names: string[]; products: { product_name: string } | null }[];
  const clash = list.find((r) => r.product_id !== productId && (r.form_names ?? []).some((f) => nameKey(f) === nameKey(name)));
  if (clash) return `"${name}" is already a form name of ${clash.products?.product_name ?? "another product"} in My products, so its leads would go there. Pick another form or change My products.`;
  const mine = list.find((r) => r.product_id === productId);
  if (!mine) return "Add this product in My products first.";
  if ((mine.form_names ?? []).some((f) => nameKey(f) === nameKey(name))) return null;
  if ((mine.form_names ?? []).length >= 30) return "This product already has 30 form names. Remove an old one in My products.";
  const { error } = await db.from("customer_products").update({ form_names: [...(mine.form_names ?? []), name], updated_at: new Date().toISOString() }).eq("user_id", userId).eq("product_id", productId);
  return error ? dbMessage(error) : null;
}

function startTimes(schedule: { start: string; hours: number | null; duration_days: number | null }, tz: string) {
  let starts: Date | null = null;
  if (schedule.start === "next_day") starts = new Date(zonedToUtc(addDays(localDate(tz), 1), "00:00", tz));
  else if (schedule.start === "in_hours") starts = new Date(Date.now() + Math.max(1, schedule.hours ?? 1) * 3600_000);
  const ends = schedule.duration_days ? new Date((starts ?? new Date()).getTime() + schedule.duration_days * 86_400_000) : null;
  return { starts_at: starts?.toISOString() ?? null, ends_at: ends?.toISOString() ?? null };
}

/** Pre-flight + the frozen plan. Problems come back next to the field to fix; nothing is created on Meta or TikTok here. */
export async function submitLaunch(input: z.input<typeof launchInput>): Promise<ActionResult<{ ref: string }>> {
  return run(async () => {
    const u = await user();
    const d = launchInput.parse(input);
    const [account, tpl, products] = await Promise.all([getAccount(u.id), getTemplate(u.id, d.template_id), launchProducts(u.id)]);
    if (!tpl || !tpl.is_active) return { ok: false, message: "That template isn't available any more.", fieldErrors: { template_id: "Pick a template" } };
    const product = products.find((p) => p.product_id === d.product_id);
    if (!product) return { ok: false, message: "Add this product in My products first.", fieldErrors: { product_id: "Not in My products" } };
    const t0 = tpl.data;
    const errors: Issue[] = [];
    for (const p of t0.platforms) {
      if (!accountReady(account, p)) {
        const s = p === "meta" ? account?.meta_status : account?.tiktok_status;
        errors.push({ field: "account", platform: p, message: s === "requested" ? `${PLATFORM_LABEL[p]}: Retexia is still confirming access to your account (usually within a day).` : s === "problem" ? `${PLATFORM_LABEL[p]}: your account connection needs attention (Accounts).` : `Connect your ${PLATFORM_LABEL[p]} account first (Accounts).` });
      }
    }
    if (errors.length) return failWith(errors);
    let a = account!;

    // Another ad account of their Business portfolio (own token only, ticked for Autopublish in Connections).
    let pickedAccount: { id: string; name: string | null } | null = null;
    if (d.meta_ad_account_id && t0.platforms.includes("meta") && d.meta_ad_account_id !== a.meta_ad_account_id) {
      if (a.meta_via !== "token") return { ok: false, message: "Pick an ad account from Connections.", fieldErrors: { meta_ad_account_id: "Not available" } };
      const { data: asset } = await feederDb().from("meta_assets").select("asset_id, name, info, status").eq("user_id", u.id).eq("kind", "ad_account").eq("asset_id", d.meta_ad_account_id).eq("for_autopublish", true).maybeSingle();
      if (!asset || asset.status !== "ok") return { ok: false, message: "That ad account isn't ready (Connections → Check again).", fieldErrors: { meta_ad_account_id: "Not ready" } };
      const info = (asset.info ?? {}) as { currency?: string | null; timezone?: string | null };
      pickedAccount = { id: String(asset.asset_id), name: (asset.name as string | null) ?? null };
      a = { ...a, meta_ad_account_id: pickedAccount.id, currency: info.currency && /^[A-Z]{3}$/.test(info.currency) ? info.currency : a.currency, timezone: info.timezone || a.timezone };
    }

    // Forms picked at launch must be ones Retexia found on the account.
    const metaForm = d.meta_form ? (a.meta_info.forms ?? []).find((f) => f.id === d.meta_form!.id) : null;
    if (d.meta_form && !metaForm) return { ok: false, message: "That Instant Form wasn't found on your Page. Press \"Check again\" in Accounts.", fieldErrors: { meta_form: "Not found" } };
    const ttForm = d.tiktok_form ? (a.tiktok_info.forms ?? []).find((f) => f.id === d.tiktok_form!.id) : null;
    if (d.tiktok_form && !ttForm) return { ok: false, message: "That TikTok Instant Form wasn't found. Press \"Check again\" in Accounts.", fieldErrors: { tiktok_form: "Not found" } };
    const leadsMeta = t0.objective === "leads" && t0.platforms.includes("meta");
    if (leadsMeta && t0.destination.lead_form.mode === "pick" && !metaForm) return { ok: false, message: "Pick the Instant Form for these ads.", fieldErrors: { meta_form: "Pick a form" } };
    // The name everything is called: the picked form's name, else the chosen form name.
    const formName = (metaForm?.name ?? d.form_name).trim();
    if (!metaForm && ![product.name, ...product.form_names].some((n) => nameKey(n) === nameKey(formName))) {
      return { ok: false, message: "Pick one of this product's form names (or add it in My products).", fieldErrors: { form_name: "Not one of the product's form names" } };
    }

    // Files: theirs, and really uploaded.
    if (d.creatives.some((c) => !c.path.startsWith(`${u.id}/`))) throw new AccessError("These files don't belong to this account.");
    const { data: found } = await feederDb().storage.from(BUCKET).createSignedUrls(d.creatives.map((c) => c.path), 60);
    const missing = d.creatives.filter((c) => !(found ?? []).some((f) => f.path === c.path && f.signedUrl && !f.error));
    if (missing.length) return { ok: false, message: `${missing.map((m) => m.name).join(", ")} didn't finish uploading. Remove and add ${missing.length === 1 ? "it" : "them"} again.`, fieldErrors: { creatives: "Upload again" } };

    // Template + allowed changes → snapshot → plan.
    const { template, warnings } = applyOverrides(t0, d.overrides ?? {});
    const creatives = d.creatives.map((c, i) => ({ position: i + 1, kind: c.kind, name: c.name }));
    const today = localDate(a.timezone);
    const plan = compile({ template, creatives, product: { name: product.name, form_name: formName, price: product.price }, currency: a.currency, date: today });
    errors.push(...plan.errors);
    warnings.push(...plan.warnings);

    // Account-specific checks.
    if (template.objective === "messages" && template.destination.message_app === "whatsapp" && !a.meta_whatsapp) errors.push({ field: "account.meta_whatsapp", message: "Add the WhatsApp number linked to your Page in Accounts." });
    if (template.objective === "sales" && !a.meta_pixel_id) errors.push({ field: "account.meta_pixel_id", message: "Website sales need your Meta Pixel ID (Accounts)." });
    if (template.objective === "sales" && a.meta_info.problems?.some((p) => /Pixel/.test(p))) warnings.push({ field: "account.meta_pixel_id", message: "Retexia couldn't check your Pixel; make sure it's shared and firing." });
    if (leadsMeta && !metaForm && !a.privacy_policy_url && !(a.meta_info.forms ?? []).some((f) => nameKey(f.name) === nameKey(formName) && (!f.status || f.status === "ACTIVE"))) {
      errors.push({ field: "account.privacy_policy_url", message: `There's no Instant Form named "${formName}" on your Page yet. Add your privacy policy link in Accounts so Retexia can make it, or pick an existing form.` });
    }
    if (template.objective === "leads" && template.platforms.includes("tiktok") && !ttForm && !(a.tiktok_info.forms ?? []).some((f) => [formName, ...product.form_names].some((n) => nameKey(n) === nameKey(f.name)))) {
      warnings.push({ field: "tiktok_form", platform: "tiktok", message: `No TikTok Instant Form named "${formName}" was found. Pick one, or make one with that name in TikTok Ads Manager before the ads are built.` });
    }
    // Spend limit (both platforms, everything Autopublish has switched on).
    const newDaily = plan.platforms.reduce((s, p) => s + p.daily, 0);
    if (a.max_daily_spend != null) {
      const on = await activeSpend(u.id, "AP-NONE00");
      if (on + newDaily > Number(a.max_daily_spend) + 0.001) errors.push({ field: "budget", message: `This launch adds ${money(newDaily, a.currency)} a day; with what's already running that's ${money(on + newDaily, a.currency)}, over your limit of ${money(Number(a.max_daily_spend), a.currency)} (Accounts).` });
    }
    if (errors.length) return failWith(errors);

    // Form names: the one used (and a picked TikTok form) become this product's form names, so Bulk create matches the leads.
    await ensureCustomer(u);
    for (const n of [formName, ...(ttForm ? [ttForm.name] : [])]) {
      const problem = await addFormName(u.id, product.product_id, n);
      if (problem) return { ok: false, message: problem, fieldErrors: { form_name: problem } };
    }

    const times = startTimes(template.schedule, a.timezone);
    const snapshot: Snapshot = {
      template,
      product: { id: product.product_id, name: product.name, form_name: formName, form_names: [...new Set([...product.form_names, formName])], price: product.price },
      currency: a.currency,
      timezone: a.timezone,
      ...times,
      forms: { meta: metaForm ? { id: metaForm.id, name: metaForm.name } : null, tiktok: ttForm ? { id: ttForm.id, name: ttForm.name } : null },
      date: today,
      meta_ad_account: pickedAccount,
    };
    const approval = template.require_approval ?? a.approval_required;
    const db = feederDb();
    let ref = "";
    for (let i = 0; i < 5 && !ref; i++) {
      const tryRef = `AP-${code(6)}`;
      const { error } = await db.from("ad_launches").insert({
        ref: tryRef,
        user_id: u.id,
        template_id: tpl.id,
        template_version: tpl.version,
        template_name: t0.name,
        product_id: product.product_id,
        product_name: product.name,
        form_name: formName,
        snapshot,
        overrides: d.overrides ?? {},
        summary: plan.summary,
        totals: Object.fromEntries(plan.platforms.map((p) => [p.platform, p.daily])),
        warnings,
        state: approval ? "awaiting_approval" : "queued",
        approval_code: approval ? code(4) : null,
        approval_requested_at: approval ? new Date().toISOString() : null,
        approval_expires_at: approval ? new Date(Date.now() + (Number(process.env.APPROVAL_EXPIRE_HOURS) || 48) * 3600_000).toISOString() : null,
        next_run_at: approval ? new Date(Date.now() + 6 * 3600_000).toISOString() : new Date().toISOString(),
        created_by: u.id,
      });
      if (!error) ref = tryRef;
      else if (error.code !== "23505") return { ok: false, message: dbMessage(error) };
    }
    if (!ref) return { ok: false, message: "Please try again." };
    const c1 = await db.from("ad_creatives").insert(
      d.creatives.map((c, i) => ({ launch_ref: ref, position: i + 1, name: c.name, storage_path: c.path, kind: c.kind, mime: c.mime, size_bytes: c.size, width: c.width ?? null, height: c.height ?? null, duration_s: c.duration ?? null })),
    );
    const c2 = await db.from("ad_nodes").insert(plan.nodes.map((n) => ({ ...n, launch_ref: ref, user_id: u.id })));
    if (c1.error || c2.error) {
      await db.from("ad_launches").delete().eq("ref", ref);
      return { ok: false, message: dbMessage(c1.error ?? c2.error) };
    }
    await logEvent({ userId: u.id, ref, type: "launch.submitted", actor: "customer", message: `Launch submitted: ${product.name} with ${d.creatives.length} creative${d.creatives.length === 1 ? "" : "s"} · ${plan.summary}` });
    if (approval) {
      const { data: l } = await db.from("ad_launches").select("ref, last_notified_at, product_name, approval_code").eq("ref", ref).single();
      await logEvent({ userId: u.id, ref, type: "approval.requested", message: "Waiting for approval before anything is published." });
      if (l) await notifyLaunch(l as LaunchRow, a, "approval", `New ads wait for your OK (${ref}, code ${l.approval_code}):\n${product.name} · ${plan.summary}\nCreatives: ${d.creatives.map((c, i) => `#${i + 1} ${c.name}`).join(", ")}\nApprove or reject them in Retexia:`);
    } else {
      after(() => runTick({ ref, budgetMs: 50_000, worker: "submit" }).catch((e) => console.error("[autopublish] kick", e)));
    }
    return done(approval ? "Sent for approval" : "Launched: building your ads now", { ref });
  });
}

// ---------------------------------------------------------------------------
// After a launch
// ---------------------------------------------------------------------------

async function myLaunch(ref: string) {
  const u = await user();
  const r = z.string().regex(/^AP-[A-Z2-9]{6}$/).parse(ref);
  const { data } = await feederDb().from("ad_launches").select("*").eq("ref", r).eq("user_id", u.id).maybeSingle();
  if (!data) throw new AccessError("That launch wasn't found.");
  return { u, launch: data as LaunchRow };
}

/** Approve all creatives, or only some (#1, #3): nodes built only from the others are skipped. */
export async function approveLaunch(input: { ref: string; positions?: number[] }): Promise<ActionResult> {
  return run(async () => {
    const { u, launch } = await myLaunch(input.ref);
    if (launch.state !== "awaiting_approval") return { ok: false, message: "This launch isn't waiting for approval." };
    const db = feederDb();
    const { data: cs } = await db.from("ad_creatives").select("position").eq("launch_ref", launch.ref);
    const all = (cs ?? []).map((c) => c.position as number);
    const ok = input.positions?.length ? all.filter((p) => input.positions!.includes(p)) : all;
    if (!ok.length) return { ok: false, message: "Pick at least one creative, or reject the launch." };
    const { data: nodes } = await db.from("ad_nodes").select("id, platform, key, level, parent_key, creative_positions, budget_daily, budget_lifetime").eq("launch_ref", launch.ref);
    const list = (nodes ?? []) as NodeRow[];
    const skip = skippedKeys(list, ok);
    const skipIds = list.filter((n) => skip.has(`${n.platform}:${n.key}`)).map((n) => n.id);
    if (skipIds.length) await db.from("ad_nodes").update({ state: "skipped" }).in("id", skipIds);
    await db.from("ad_creatives").update({ approved: false }).eq("launch_ref", launch.ref).not("position", "in", `(${ok.join(",")})`);
    const days = Math.max(1, launch.snapshot.template.schedule.duration_days ?? 1);
    const totals: Record<string, number> = {};
    for (const n of list.filter((x) => !skip.has(`${x.platform}:${x.key}`))) totals[n.platform] = (totals[n.platform] ?? 0) + (n.budget_daily != null ? Number(n.budget_daily) : n.budget_lifetime != null ? Number(n.budget_lifetime) / days : 0);
    await db.from("ad_launches").update({ state: "queued", approved_by: u.id, approved_at: new Date().toISOString(), totals, next_run_at: new Date().toISOString() }).eq("ref", launch.ref);
    await logEvent({ userId: launch.user_id, ref: launch.ref, type: "approval.approved", actor: "approver", message: ok.length === all.length ? "Approved: building now." : `Approved creatives ${ok.map((p) => `#${p}`).join(", ")} only; the others are skipped.` });
    after(() => runTick({ ref: launch.ref, budgetMs: 50_000, worker: "approve" }).catch((e) => console.error("[autopublish] kick", e)));
    return done("Approved: building your ads now");
  });
}

export async function rejectLaunch(input: { ref: string; reason: string }): Promise<ActionResult> {
  return run(async () => {
    const { launch } = await myLaunch(input.ref);
    if (!["awaiting_approval", "queued"].includes(launch.state)) return { ok: false, message: "Only launches that haven't started can be rejected." };
    const reason = z.string().trim().max(300).parse(input.reason ?? "");
    await feederDb().from("ad_launches").update({ state: launch.state === "queued" ? "cancelled" : "rejected", reject_reason: reason || null, next_run_at: null }).eq("ref", launch.ref).in("state", ["awaiting_approval", "queued"]);
    await logEvent({ userId: launch.user_id, ref: launch.ref, type: "approval.rejected", actor: "approver", message: `Not published${reason ? `: ${reason}` : "."}` });
    return done(launch.state === "queued" ? "Launch cancelled" : "Launch rejected");
  });
}

/** Retry after fixing (optionally with new ad text for steps that haven't been made yet). */
export async function retryLaunchAction(input: { ref: string; copy?: { primary_text?: string; headline?: string; description?: string; tiktok_text?: string } | null }): Promise<ActionResult> {
  return run(async () => {
    const { launch } = await myLaunch(input.ref);
    if (!["needs_attention", "failed", "blocked", "partly_live", "building", "activating", "in_review", "live"].includes(launch.state)) return { ok: false, message: "There's nothing to retry." };
    if (input.copy) {
      const c = z.object({ primary_text: z.string().trim().max(2000).optional(), headline: z.string().trim().max(255).optional(), description: z.string().trim().max(255).optional(), tiktok_text: z.string().trim().max(100).optional() }).parse(input.copy);
      const snap = launch.snapshot;
      for (const k of ["primary_text", "headline", "description", "tiktok_text"] as const) if (c[k]) snap.template.copy[k] = c[k]!;
      await feederDb().from("ad_launches").update({ snapshot: snap }).eq("ref", launch.ref);
    }
    await retryLaunch(launch);
    await logEvent({ userId: launch.user_id, ref: launch.ref, type: "retry", actor: "customer", message: "Trying again." });
    after(() => runTick({ ref: launch.ref, budgetMs: 50_000, worker: "retry" }).catch((e) => console.error("[autopublish] kick", e)));
    return done("Trying again now");
  });
}

export async function setLaunchPaused(input: { ref: string; paused: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { launch } = await myLaunch(input.ref);
    if (input.paused && !["in_review", "live", "partly_live", "needs_attention"].includes(launch.state)) return { ok: false, message: "Only running launches can be paused." };
    if (!input.paused && launch.state !== "paused") return { ok: false, message: "This launch isn't paused." };
    const errors = await setLaunchRunning(launch, !input.paused);
    await logEvent({ userId: launch.user_id, ref: launch.ref, type: input.paused ? "paused" : "resumed", actor: "customer", message: input.paused ? "Paused by you." : "Switched on again by you." });
    if (errors.length) return { ok: false, message: `Partly done: ${errors[0]}` };
    return done(input.paused ? "Paused" : "Switched on");
  });
}

/** Fix & resubmit a disapproved Meta ad: a new creative with the changed text, the ad points to it, back to review (at most twice). */
export async function resubmitAd(input: { ref: string; node_id: string; copy: { primary_text: string; headline: string; description: string } }): Promise<ActionResult> {
  return run(async () => {
    const { launch } = await myLaunch(input.ref);
    const nodeId = z.uuid().parse(input.node_id);
    const copy = z.object({ primary_text: z.string().trim().min(1, "Write the ad text").max(2000), headline: z.string().trim().max(255), description: z.string().trim().max(255) }).parse(input.copy);
    const ctx = await loadCtx(launch);
    const n = ctx.nodes.find((x) => x.id === nodeId && x.level === "ad");
    if (!n || !n.platform_id) return { ok: false, message: "That ad wasn't found." };
    if (!["disapproved", "with_issues"].includes(n.state)) return { ok: false, message: "Only ads that weren't approved can be resubmitted." };
    if (n.platform !== "meta") return { ok: false, message: "For TikTok, change the ad in TikTok Ads Manager (Fix & resubmit for TikTok is coming)." };
    if (n.resubmits >= MAX_RESUBMITS) return { ok: false, message: "This ad was already resubmitted twice. Talk to the Retexia team so the account stays in good standing." };
    const old = launch.snapshot.template.copy;
    if (copy.primary_text === old.primary_text && copy.headline === old.headline && copy.description === old.description) return { ok: false, message: "Change the text first: an unchanged ad would be rejected again." };
    if (!ctx.account || !accountReady(ctx.account, "meta")) return { ok: false, message: "Your Meta connection needs attention (Accounts)." };
    const fill = (s: string) => s.replace(/\{product\}/gi, ctx.snap.product.name);
    const made = await buildCreative({ ...ctx, account: ctx.account }, n.creative_positions[0]!, `${n.name} · fix ${n.resubmits + 1}`, { message: fill(copy.primary_text), headline: fill(copy.headline), description: fill(copy.description) });
    if (made.kind !== "done" || !made.platform_id) {
      const msg = made.kind === "fix" ? made.message : made.kind === "error" ? String(made.reply.body?.error?.error_user_msg ?? made.reply.body?.error?.message ?? "Meta didn't accept the change.") : "Try again in a minute.";
      return { ok: false, message: msg.slice(0, 300) };
    }
    const r = await gateway({ action: "meta", method: "POST", path: n.platform_id, params: { creative: { creative_id: made.platform_id }, status: "ACTIVE" } });
    if (!r.ok) return { ok: false, message: String(r.body?.error?.error_user_msg ?? r.body?.error?.message ?? "Meta didn't accept the change.").slice(0, 300) };
    const db = feederDb();
    await db
      .from("ad_nodes")
      .update({ state: "in_review", resubmits: n.resubmits + 1, review: null, error_message: null, fix_field: null, error_category: null, platform_extra: { ...n.platform_extra, creative_id: made.platform_id, resubmitted_at: new Date().toISOString() }, updated_at: new Date().toISOString() })
      .eq("id", n.id);
    n.state = "in_review";
    const { state, problem } = deriveState(ctx);
    await db.from("ad_launches").update({ state, problem, next_run_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("ref", launch.ref);
    await logEvent({ userId: launch.user_id, ref: launch.ref, nodeId: n.id, type: "ad.resubmitted", actor: "customer", message: `Meta · ${n.name}: resubmitted with new text (${n.resubmits + 1} of ${MAX_RESUBMITS}).` });
    return done("Resubmitted: back in Meta's review");
  });
}
