import "server-only";

import { feederDb } from "../db";
import { classify, type Classified } from "./errors";
import { explainDisapproval, metaReview, metaSetStatus, metaStep } from "./meta";
import { notifyLaunch, logEvent } from "./notify";
import { LIMITS, money, PLATFORM_LABEL, type Platform } from "./plan";
import type { StepCtx, StepResult } from "./step";
import { tiktokReview, tiktokSetStatus, tiktokStep } from "./tiktok";
import { BUILT, PROBLEM, type AccountRow, type CreativeRow, type LaunchRow, type LaunchState, type NodeRow, type NodeState } from "./types";

/**
 * WF-03 Runner. Woken every minute by Supabase (pg_cron → /api/feeder/autopublish/tick)
 * when a launch is due, and right after a launch is submitted. It claims due
 * launches (one per customer at a time, locked 5 minutes) and moves each one
 * forward by small, idempotent steps: a step first checks the ID it saved, every
 * new ID is saved at once, nothing waits inside a request (video processing is
 * "look again in 30 s"), and nothing is switched on before the whole tree is made.
 */

export const BUCKET = "autopublish";
export const MAX_RESUBMITS = 2;
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
const MAX_ATTEMPTS = 5;
const IN_FLIGHT: NodeState[] = ["pending", "retry_wait", "processing_media"];
const LEVEL_ORDER = { media: 0, form: 1, campaign: 2, adset: 3, creative: 4, ad: 5 } as const;
const APPROVAL_REMIND_HOURS = Number(process.env.APPROVAL_REMIND_HOURS) || 6;

const nowIso = () => new Date().toISOString();
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();

/** A step context whose account may be missing (pages, actions). */
type AnyCtx = Omit<StepCtx, "account"> & { account: AccountRow | null };

export function accountReady(a: AccountRow | null, p: Platform) {
  if (!a) return false;
  return p === "meta" ? a.meta_status === "connected" && Boolean(a.meta_ad_account_id && a.meta_page_id) : a.tiktok_status === "connected" && Boolean(a.tiktok_advertiser_id);
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export async function runTick(opts: { budgetMs?: number; ref?: string; worker?: string } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 100_000);
  const db = feederDb();
  const { data, error } = await db.rpc("ad_claim_launches", { p_limit: opts.ref ? 1 : 6, p_worker: (opts.worker ?? "tick").slice(0, 60), p_ref: opts.ref ?? null });
  if (error) throw new Error(`claim: ${error.message}`);
  const launches = (data ?? []) as LaunchRow[];
  const done: { ref: string; state: string }[] = [];
  for (const l of launches) {
    if (Date.now() > deadline) {
      await db.from("ad_launches").update({ locked_until: null, locked_by: null, next_run_at: nowIso() }).eq("ref", l.ref);
      continue;
    }
    try {
      done.push({ ref: l.ref, state: await processLaunch(l, deadline) });
    } catch (e) {
      console.error(`[autopublish] ${l.ref}:`, e);
      await db.from("ad_launches").update({ locked_until: null, locked_by: null, next_run_at: inSeconds(120) }).eq("ref", l.ref);
      done.push({ ref: l.ref, state: "error" });
    }
  }
  return { claimed: launches.length, launches: done };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export async function loadCtx(launch: LaunchRow): Promise<AnyCtx> {
  const db = feederDb();
  const [{ data: account }, { data: nodes, error }, { data: creatives }] = await Promise.all([
    db.from("ad_accounts").select("*").eq("user_id", launch.user_id).maybeSingle(),
    db.from("ad_nodes").select("*").eq("launch_ref", launch.ref),
    db.from("ad_creatives").select("*").eq("launch_ref", launch.ref).order("position"),
  ]);
  if (error) throw new Error(`nodes: ${error.message}`);
  const list = (nodes ?? []) as NodeRow[];
  const signed = new Map<string, string>();
  return {
    launch,
    snap: launch.snapshot,
    account: (account as AccountRow | null) ?? null,
    nodes: list,
    creatives: (creatives ?? []) as CreativeRow[],
    node: (p, k) => list.find((n) => n.platform === p && n.key === k),
    signedUrl: async (path, seconds = 3600) => {
      const k = `${path}|${seconds}`;
      if (signed.has(k)) return signed.get(k)!;
      const { data: s } = await db.storage.from(BUCKET).createSignedUrl(path, seconds);
      if (s?.signedUrl) signed.set(k, s.signedUrl);
      return s?.signedUrl ?? null;
    },
  };
}

async function saveNode(ctx: AnyCtx, n: NodeRow, patch: Partial<NodeRow>) {
  Object.assign(n, patch);
  const { error } = await feederDb()
    .from("ad_nodes")
    .update({ ...patch, updated_at: nowIso() })
    .eq("id", n.id);
  if (error) throw new Error(`save ${n.platform}:${n.key}: ${error.message}`);
}

async function saveLaunch(launch: LaunchRow, patch: Partial<LaunchRow>) {
  Object.assign(launch, patch);
  const { error } = await feederDb()
    .from("ad_launches")
    .update({ ...patch, updated_at: nowIso() })
    .eq("ref", launch.ref);
  if (error) throw new Error(`save launch ${launch.ref}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// One launch
// ---------------------------------------------------------------------------

async function processLaunch(launch: LaunchRow, deadline: number): Promise<string> {
  const release = (patch: Partial<LaunchRow>) => saveLaunch(launch, { ...patch, locked_until: null, locked_by: null });

  if (launch.state === "awaiting_approval") {
    const expires = launch.approval_expires_at ? new Date(launch.approval_expires_at).getTime() : 0;
    if (expires && expires <= Date.now()) {
      await release({ state: "expired", next_run_at: null });
      await logEvent({ userId: launch.user_id, ref: launch.ref, type: "approval.expired", message: "Nobody approved this launch in time, so it was not published. Launch it again when you're ready." });
      return "expired";
    }
    const remindAt = launch.approval_requested_at ? new Date(launch.approval_requested_at).getTime() + APPROVAL_REMIND_HOURS * 3600_000 : 0;
    if (!launch.platform_state.reminded && remindAt && remindAt <= Date.now()) {
      const { data: account } = await feederDb().from("ad_accounts").select("notify_whatsapp, approver_whatsapp").eq("user_id", launch.user_id).maybeSingle();
      if (account) await notifyLaunch(launch, account as AccountRow, "reminder", `Reminder: ${launch.product_name} ads (${launch.ref}) are still waiting for your OK. Code ${launch.approval_code}.`);
      await release({ platform_state: { ...launch.platform_state, reminded: true }, next_run_at: launch.approval_expires_at });
      return "reminded";
    }
    await release({ next_run_at: !launch.platform_state.reminded && remindAt > Date.now() ? new Date(Math.min(remindAt, expires || remindAt)).toISOString() : launch.approval_expires_at });
    return "waiting";
  }

  const ctx = await loadCtx(launch);
  if (!ctx.account) {
    await release({ state: "blocked", next_run_at: null, problem: { message: "This account's ad settings are missing. Open Autopublish → Accounts.", fix_field: "account" } });
    return "blocked";
  }
  if (launch.state === "queued") {
    await saveLaunch(launch, { state: "building" });
    await logEvent({ userId: launch.user_id, ref: launch.ref, type: "build.start", message: `Building started: ${launch.summary}` });
  }
  if (["building", "activating", "blocked", "queued"].includes(launch.state)) {
    await build(ctx as StepCtx, deadline);
  } else {
    await monitor(ctx as StepCtx);
  }
  await settle(ctx as StepCtx);
  await release({});
  return launch.state;
}

const stuck = (ctx: AnyCtx, n: NodeRow): boolean =>
  n.depends_on.some((k) => {
    const d = ctx.node(n.platform, k);
    return !d || PROBLEM.includes(d.state) || d.state === "skipped" || stuck(ctx, d);
  });

async function build(ctx: StepCtx, deadline: number) {
  const platforms = [...new Set(ctx.nodes.map((n) => n.platform))];
  const held = platforms.filter((p) => !accountReady(ctx.account, p));
  for (;;) {
    const now = Date.now();
    const ready = ctx.nodes
      .filter(
        (n) =>
          !held.includes(n.platform) &&
          IN_FLIGHT.includes(n.state) &&
          new Date(n.next_run_at).getTime() <= now &&
          n.depends_on.every((k) => ctx.node(n.platform, k)?.state === "done"),
      )
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    if (!ready.length) break;
    for (const n of ready) {
      if (Date.now() > deadline) return;
      await runNode(ctx, n);
    }
  }
  // Each platform whose tree has settled is switched on (complete branches only).
  for (const p of platforms) {
    if (held.includes(p)) continue;
    const inFlight = ctx.nodes.some((n) => n.platform === p && IN_FLIGHT.includes(n.state) && !stuck(ctx, n));
    if (!inFlight && Date.now() < deadline) await activate(ctx, p);
  }
}

/** Runs one node's step and saves the result straight away. */
export async function runNode(ctx: StepCtx, n: NodeRow) {
  let res: StepResult;
  try {
    res = n.platform === "meta" ? await metaStep(n, ctx) : await tiktokStep(n, ctx);
  } catch (e) {
    console.error(`[autopublish] ${ctx.launch.ref} ${n.platform}:${n.key}`, e);
    res = { kind: "error", reply: { ok: false, status: 0, network: true, body: { error: { message: `network: ${e instanceof Error ? e.message : "step failed"}` } } } };
  }
  const extra = (x?: Record<string, unknown>) => (x ? { platform_extra: { ...n.platform_extra, ...x } } : {});
  const id = (r: { platform_id?: string | null }) => ("platform_id" in r && r.platform_id !== undefined ? { platform_id: r.platform_id } : {});
  const clear = { error_code: null, error_category: null, error_message: null, fix_field: null, error_detail: null };

  if (res.kind === "done") {
    await saveNode(ctx, n, { state: "done", attempts: 0, ...id(res), ...extra(res.extra), ...clear });
    if (res.note) await logEvent({ userId: ctx.launch.user_id, ref: ctx.launch.ref, nodeId: n.id, type: `${n.level}.done`, message: res.note });
    return;
  }
  if (res.kind === "wait") {
    await saveNode(ctx, n, { state: n.level === "media" ? "processing_media" : "pending", next_run_at: inSeconds(res.seconds), ...id(res), ...extra(res.extra) });
    return;
  }
  if (res.kind === "fix") {
    await saveNode(ctx, n, { state: "needs_fix", error_category: "VALIDATION", error_message: res.message, fix_field: res.fix_field, error_code: null });
    await logEvent({ userId: ctx.launch.user_id, ref: ctx.launch.ref, nodeId: n.id, type: "needs_fix", message: `${PLATFORM_LABEL[n.platform]} · ${n.name}: ${res.message}` });
    return;
  }
  // A platform error: the catalog decides.
  if (res.platform_id !== undefined) await saveNode(ctx, n, { ...id(res), ...extra(res.extra) });
  const c = await classify(n.platform, res.reply);
  await applyError(ctx, n, c);
}

async function applyError(ctx: StepCtx, n: NodeRow, c: Classified) {
  const base = { error_code: c.code, error_category: c.category, error_detail: c.detail, error_message: c.message, fix_field: c.fix_field };
  const attempts = n.attempts + 1;
  const event = (type: string, message: string) => logEvent({ userId: ctx.launch.user_id, ref: ctx.launch.ref, nodeId: n.id, type, message: `${PLATFORM_LABEL[n.platform]} · ${n.name}: ${message}`, detail: { code: c.code, category: c.category } });

  if (c.action === "wait_rate_limit") {
    await saveNode(ctx, n, { ...base, state: "retry_wait", next_run_at: (c.retryAt ?? new Date(Date.now() + 5 * 60_000)).toISOString() });
    return;
  }
  if (c.action === "retry") {
    if (attempts >= MAX_ATTEMPTS) {
      await saveNode(ctx, n, { ...base, state: "failed", attempts, error_message: `${c.message} It still failed after ${MAX_ATTEMPTS} tries; the Retexia team has been told.` });
      await event("failed", c.message);
      return;
    }
    await saveNode(ctx, n, { ...base, state: "retry_wait", attempts, next_run_at: inSeconds(BACKOFF_MINUTES[attempts - 1]! * 60) });
    return;
  }
  if (c.action.startsWith("auto_fix:") && !n.platform_extra.autofixed) {
    const fixer = c.action.slice("auto_fix:".length);
    const patch: Record<string, unknown> = { autofixed: fixer };
    if (fixer === "truncate_text") {
      const t = ctx.snap.template.copy;
      patch.copy = { message: t.primary_text.slice(0, 500), headline: t.headline.slice(0, 40), description: t.description.slice(0, 30) };
      patch.text = (t.tiktok_text || t.primary_text).slice(0, LIMITS.tiktok_text - 5);
    } else if (fixer === "use_link_clicks_goal") {
      patch.use_link_clicks = true;
    }
    if (fixer === "truncate_text" || fixer === "use_link_clicks_goal") {
      await saveNode(ctx, n, { ...base, state: "retry_wait", attempts, next_run_at: inSeconds(5), platform_extra: { ...n.platform_extra, ...patch } });
      await event("auto_fix", c.message);
      return;
    }
  }
  if (c.action === "needs_admin") {
    await saveNode(ctx, n, { ...base, state: "blocked", attempts });
    await event("blocked", c.message);
    // Lost access to the customer's account: hold their other launches until it's fixed.
    if (c.category === "PERMISSION" || c.category === "ACCOUNT") {
      const col = n.platform === "meta" ? { meta_status: "problem" } : { tiktok_status: "problem" };
      await feederDb().from("ad_accounts").update(col).eq("user_id", ctx.launch.user_id);
      if (ctx.account) Object.assign(ctx.account, col);
    }
    return;
  }
  // needs_client (and fixers that can't run here): the customer changes something, then Retry.
  await saveNode(ctx, n, { ...base, state: "needs_fix", attempts });
  await event("needs_fix", c.message);
}

// ---------------------------------------------------------------------------
// Switching on (bottom-up: ads → ad sets → campaigns), only what this launch made
// ---------------------------------------------------------------------------

/** Daily budget switched on by Autopublish for this customer, other launches (both platforms). */
export async function activeSpend(userId: string, exceptRef: string) {
  const db = feederDb();
  const { data: launches } = await db.from("ad_launches").select("ref").eq("user_id", userId).neq("ref", exceptRef).in("state", ["in_review", "live", "partly_live", "needs_attention"]);
  const refs = (launches ?? []).map((l) => l.ref as string);
  if (!refs.length) return 0;
  const { data: nodes } = await db
    .from("ad_nodes")
    .select("budget_daily, budget_lifetime, launch_ref, platform_extra, state")
    .in("launch_ref", refs)
    .in("level", ["campaign", "adset"])
    .not("state", "in", "(paused,archived,skipped,failed)");
  const { data: snaps } = await db.from("ad_launches").select("ref, snapshot").in("ref", refs);
  const days = new Map((snaps ?? []).map((s) => [s.ref as string, Math.max(1, Number((s.snapshot as LaunchRow["snapshot"])?.template?.schedule?.duration_days ?? 1))]));
  return (nodes ?? [])
    .filter((n) => (n.platform_extra as Record<string, unknown>)?.activated === true && !(n.platform_extra as Record<string, unknown>)?.existed)
    .reduce((s, n) => s + (n.budget_daily != null ? Number(n.budget_daily) : n.budget_lifetime != null ? Number(n.budget_lifetime) / (days.get(n.launch_ref as string) ?? 1) : 0), 0);
}

export async function activate(ctx: StepCtx, p: Platform) {
  const ads = ctx.nodes.filter((n) => n.platform === p && n.level === "ad" && n.state === "done" && !n.platform_extra.activated);
  if (!ads.length) return;
  const launch = ctx.launch;
  const t = ctx.snap.template;

  if (t.launch_as === "paused") {
    for (const a of ads) await saveNode(ctx, a, { state: "paused" });
    await logEvent({ userId: launch.user_id, ref: launch.ref, type: "built.paused", message: `${PLATFORM_LABEL[p]}: everything is made and left paused (the template says "Launch as paused"). Switch it on with Resume.` });
    return;
  }

  // Groups and campaigns this launch made, that get at least one ad switched on.
  const adsets = ctx.nodes.filter((s) => s.platform === p && s.level === "adset" && s.action === "create" && s.state === "done" && !s.platform_extra.activated && ads.some((a) => a.parent_key === s.key));
  const campaigns = ctx.nodes.filter(
    (c) =>
      c.platform === p &&
      c.level === "campaign" &&
      c.state === "done" &&
      !c.platform_extra.activated &&
      (c.action === "create" || (c.action === "slot" && !c.platform_extra.existed)) &&
      ctx.nodes.some((s) => s.platform === p && s.parent_key === c.key && (adsets.includes(s) || s.platform_extra.activated)),
  );

  // Spend limit (both platforms): this launch's new budgets + what's already on.
  const max = ctx.account?.max_daily_spend != null ? Number(ctx.account.max_daily_spend) : null;
  if (max != null) {
    const days = Math.max(1, t.schedule.duration_days ?? 1);
    const holders = [...adsets, ...campaigns].filter((n) => n.budget_daily != null || n.budget_lifetime != null);
    const other = ctx.nodes.filter((n) => n.platform !== p && n.platform_extra.activated && (n.level === "campaign" || n.level === "adset") && !n.platform_extra.existed);
    const sum = (list: NodeRow[]) => list.reduce((s, n) => s + (n.budget_daily != null ? Number(n.budget_daily) : n.budget_lifetime != null ? Number(n.budget_lifetime) / days : 0), 0);
    const total = (await activeSpend(launch.user_id, launch.ref)) + sum(other) + sum(holders);
    if (total > max + 0.001) {
      const message = `Switching these ads on would take your Autopublish spend to ${money(total, ctx.snap.currency)} a day, over your limit of ${money(max, ctx.snap.currency)}. Raise the limit in Accounts or pause another launch, then press Retry.`;
      await saveLaunch(launch, { problem: { message, fix_field: "account.max_daily_spend" } });
      for (const a of ads) await saveNode(ctx, a, { state: "needs_fix", error_message: message, fix_field: "account.max_daily_spend", error_category: "LIMIT" });
      await logEvent({ userId: launch.user_id, ref: launch.ref, type: "guardrail", message });
      return;
    }
  }

  const on: NodeRow[] = [];
  const fail = async (list: NodeRow[], c: Classified) => {
    for (const n of list) await applyError(ctx, n, c);
  };
  if (p === "meta") {
    for (const a of ads) {
      const r = await metaSetStatus(a.platform_id!, "ACTIVE");
      if (r.ok) on.push(a);
      else await fail([a], await classify("meta", r));
    }
    for (const s of adsets.filter((s) => on.some((a) => a.parent_key === s.key))) {
      const r = await metaSetStatus(s.platform_id!, "ACTIVE");
      if (r.ok) await saveNode(ctx, s, { platform_extra: { ...s.platform_extra, activated: true } });
      else await fail([s], await classify("meta", r));
    }
    for (const c of campaigns) {
      const r = await metaSetStatus(c.platform_id!, "ACTIVE");
      if (r.ok) await saveNode(ctx, c, { platform_extra: { ...c.platform_extra, activated: true } });
      else await fail([c], await classify("meta", r));
    }
  } else {
    const adv = ctx.account!.tiktok_advertiser_id!;
    const ra = await tiktokSetStatus(adv, "ad", ads.map((a) => a.platform_id!), "ENABLE");
    if (ra.ok) on.push(...ads);
    else await fail(ads, await classify("tiktok", ra));
    const groups = adsets.filter((s) => on.some((a) => a.parent_key === s.key));
    if (groups.length) {
      const rg = await tiktokSetStatus(adv, "adset", groups.map((s) => s.platform_id!), "ENABLE");
      if (rg.ok) for (const s of groups) await saveNode(ctx, s, { platform_extra: { ...s.platform_extra, activated: true } });
      else await fail(groups, await classify("tiktok", rg));
    }
    if (campaigns.length) {
      const rc = await tiktokSetStatus(adv, "campaign", campaigns.map((c) => c.platform_id!), "ENABLE");
      if (rc.ok) for (const c of campaigns) await saveNode(ctx, c, { platform_extra: { ...c.platform_extra, activated: true } });
      else await fail(campaigns, await classify("tiktok", rc));
    }
  }
  const at = nowIso();
  for (const a of on) await saveNode(ctx, a, { state: "in_review", next_run_at: inSeconds(300), platform_extra: { ...a.platform_extra, activated: true, activated_at: at } });
  if (on.length) {
    const slotPaused = ctx.nodes.find((c) => c.platform === p && c.level === "campaign" && c.action === "slot" && c.platform_extra.existed && c.platform_extra.was_status && c.platform_extra.was_status !== "ACTIVE");
    await saveLaunch(launch, { activated_at: launch.activated_at ?? at, platform_state: { ...launch.platform_state, [p]: { ...(launch.platform_state[p] ?? {}), activated_at: at } } });
    await logEvent({
      userId: launch.user_id,
      ref: launch.ref,
      type: "activated",
      message: `${PLATFORM_LABEL[p]}: ${on.length} ad${on.length === 1 ? "" : "s"} switched on and sent to ${PLATFORM_LABEL[p]}'s review.${slotPaused ? " Your evergreen campaign is paused in Ads Manager: switch it on there to start spending." : ""}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Review and delivery (WF-06): every 10 minutes while in review, then every 6 hours for a week
// ---------------------------------------------------------------------------

async function monitor(ctx: StepCtx) {
  const watched: NodeState[] = ["in_review", "live", "scheduled", "disapproved", "with_issues", "paused"];
  for (const p of [...new Set(ctx.nodes.map((n) => n.platform))]) {
    if (!accountReady(ctx.account, p)) continue;
    const ads = ctx.nodes.filter((n) => n.platform === p && n.level === "ad" && n.platform_id && n.platform_extra.activated && watched.includes(n.state));
    if (!ads.length) continue;
    if (p === "meta") {
      const r = await metaReview(ads.map((a) => a.platform_id!));
      if (!r.ok) {
        console.error(`[autopublish] review ${ctx.launch.ref}:`, r.reply.status);
        continue;
      }
      for (const a of ads) {
        const v = r.map.get(a.platform_id!);
        if (!v?.state) continue;
        if (v.state === "disapproved") await reviewChange(ctx, a, "disapproved", explainDisapproval(v.reasons), v.reasons, "copy");
        else if (v.state === "with_issues") {
          const c = v.issue ? await classify("meta", v.issue) : null;
          await reviewChange(ctx, a, "with_issues", c?.message ?? "Meta shows a problem with this ad. Open it in Ads Manager to see why.", [], c?.fix_field ?? null);
        } else await reviewChange(ctx, a, v.state, null, [], null);
      }
    } else {
      const r = await tiktokReview(ctx.account!.tiktok_advertiser_id!, ads.map((a) => a.platform_id!));
      if (!r.ok) continue;
      for (const a of ads) {
        const v = r.map.get(a.platform_id!);
        if (!v?.state) continue;
        if (v.state === "disapproved") await reviewChange(ctx, a, "disapproved", `TikTok didn't approve this ad${v.reasons.length ? `: ${v.reasons.join("; ")}` : "."} Change the video or text it mentions, then fix it in TikTok Ads Manager.`, v.reasons, "copy");
        else await reviewChange(ctx, a, v.state, null, [], null);
      }
    }
  }
}

async function reviewChange(ctx: StepCtx, a: NodeRow, state: NodeState, message: string | null, reasons: string[], fixField: string | null) {
  const review = { status: state, reasons, checked_at: nowIso() };
  if (a.state === state) {
    await saveNode(ctx, a, { review });
    return;
  }
  await saveNode(ctx, a, { state, review, error_message: message, fix_field: fixField, error_category: state === "disapproved" ? "POLICY" : message ? "VALIDATION" : null });
  const p = PLATFORM_LABEL[a.platform];
  if (state === "live") await logEvent({ userId: ctx.launch.user_id, ref: ctx.launch.ref, nodeId: a.id, type: "ad.live", message: `${p} · ${a.name}: approved and live ✅` });
  else if (message) await logEvent({ userId: ctx.launch.user_id, ref: ctx.launch.ref, nodeId: a.id, type: `ad.${state}`, message: `${p} · ${a.name}: ${message}` });
}

// ---------------------------------------------------------------------------
// The launch's state, problem and next run, from its nodes
// ---------------------------------------------------------------------------

export function deriveState(ctx: AnyCtx): { state: LaunchState; problem: LaunchRow["problem"] } {
  const live = ctx.nodes.filter((n) => n.state !== "skipped");
  const ads = live.filter((n) => n.level === "ad");
  const firstProblem = live.find((n) => PROBLEM.includes(n.state) || n.state === "disapproved" || n.state === "with_issues");
  const problem = firstProblem ? { message: `${PLATFORM_LABEL[firstProblem.platform]} · ${firstProblem.name}: ${firstProblem.error_message ?? "needs attention"}`, fix_field: firstProblem.fix_field } : ctx.launch.problem?.fix_field === "account.max_daily_spend" ? ctx.launch.problem : null;
  const held = [...new Set(live.map((n) => n.platform))].filter((p) => !accountReady(ctx.account, p));
  const inFlight = live.some((n) => IN_FLIGHT.includes(n.state) && !stuck(ctx, n) && !held.includes(n.platform));
  if (!ads.length) return { state: "cancelled", problem: null };
  if (inFlight) return { state: "building", problem };
  const waitingForAccount = live.some((n) => IN_FLIGHT.includes(n.state) && held.includes(n.platform));
  const good = ads.filter((a) => ["in_review", "live", "scheduled"].includes(a.state));
  const bad = ads.filter((a) => PROBLEM.includes(a.state) || ["disapproved", "with_issues"].includes(a.state) || (IN_FLIGHT.includes(a.state) && (stuck(ctx, a) || held.includes(a.platform))));
  if (ads.every((a) => a.state === "paused" || a.state === "archived")) return { state: "paused", problem };
  if (good.length) {
    if (bad.length || waitingForAccount) return { state: "partly_live", problem: problem ?? (waitingForAccount ? accountProblem(held) : null) };
    return { state: good.some((a) => a.state === "in_review") ? "in_review" : "live", problem: null };
  }
  if (waitingForAccount || live.some((n) => n.state === "blocked")) return { state: "blocked", problem: problem ?? accountProblem(held) };
  if (ads.some((a) => a.state === "done")) return { state: "activating", problem };
  if (bad.some((a) => a.state !== "failed") || live.some((n) => n.state === "needs_fix")) return { state: "needs_attention", problem };
  return { state: "failed", problem };
}

const accountProblem = (held: Platform[]) => ({
  message: `Waiting for your ${held.map((p) => PLATFORM_LABEL[p]).join(" and ")} connection: Retexia needs to confirm access (Autopublish → Accounts).`,
  fix_field: "account",
});

async function settle(ctx: StepCtx) {
  const launch = ctx.launch;
  const before = launch.state;
  const { state, problem } = deriveState(ctx);
  const inFlight = ctx.nodes.filter((n) => IN_FLIGHT.includes(n.state) && !stuck(ctx, n) && accountReady(ctx.account, n.platform));
  let next: string | null = null;
  if (inFlight.length) next = new Date(Math.max(Date.now() + 5_000, Math.min(...inFlight.map((n) => new Date(n.next_run_at).getTime())))).toISOString();
  else if (state === "blocked") next = inSeconds(30 * 60);
  else if (state === "activating") next = inSeconds(60);
  else if (["in_review", "live", "partly_live", "needs_attention"].includes(state)) {
    const reviewing = ctx.nodes.some((n) => n.level === "ad" && n.state === "in_review");
    const since = launch.activated_at ? Date.now() - new Date(launch.activated_at).getTime() : 0;
    next = reviewing ? inSeconds(10 * 60) : since < 7 * 86_400_000 && launch.activated_at ? inSeconds(6 * 3600) : null;
  }
  await saveLaunch(launch, { state, problem, next_run_at: next });

  if (before !== state) {
    const msg: Partial<Record<LaunchState, string>> = {
      in_review: `Your ${launch.product_name} ads are made and in the platforms' review now.`,
      live: `Your ${launch.product_name} ads are live ✅`,
      partly_live: `Some of your ${launch.product_name} ads are live; ${problem ? `one needs attention: ${problem.message}` : "the others need attention."}`,
      needs_attention: `Your ${launch.product_name} ads need your attention: ${problem?.message ?? "open the launch to see why."}`,
      blocked: `Your ${launch.product_name} ads are on hold: ${problem?.message ?? "the Retexia team is looking at it."}`,
      failed: `Your ${launch.product_name} ads couldn't be made: ${problem?.message ?? "open the launch to see why."}`,
    };
    const text = msg[state];
    if (text) {
      await logEvent({ userId: launch.user_id, ref: launch.ref, type: `launch.${state}`, message: text });
      if (ctx.account && state !== "in_review") await notifyLaunch(launch, ctx.account, "update", `Retexia Autopublish · ${launch.ref}\n${text}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Actions from the launch page (called by server actions after their checks)
// ---------------------------------------------------------------------------

/** Retry: failed / blocked / needs-fix steps start again (attempts reset); the runner picks it up at once. */
export async function retryLaunch(launch: LaunchRow) {
  const db = feederDb();
  const { error } = await db
    .from("ad_nodes")
    .update({ state: "pending", attempts: 0, next_run_at: nowIso(), error_code: null, error_category: null, error_message: null, fix_field: null, error_detail: null, updated_at: nowIso() })
    .eq("launch_ref", launch.ref)
    .in("state", ["failed", "blocked", "needs_fix"]);
  if (error) throw new Error(error.message);
  // (A step that already has its ID just confirms it, so made ads stopped by the spend limit are switched on next.)
  await db.from("ad_launches").update({ state: "building", problem: null, next_run_at: nowIso(), updated_at: nowIso() }).eq("ref", launch.ref);
}

/** Pause or resume what this launch made (top-most made objects only; never things it reused). */
export async function setLaunchRunning(launch: LaunchRow, on: boolean) {
  const ctx = await loadCtx(launch);
  if (!ctx.account) throw new Error("Account missing");
  const errors: string[] = [];
  for (const p of [...new Set(ctx.nodes.map((n) => n.platform))]) {
    if (!accountReady(ctx.account, p)) continue;
    const made = (n: NodeRow) => n.platform === p && n.platform_id && BUILT.includes(n.state) && (n.action === "create" || (n.action === "slot" && !n.platform_extra.existed));
    // The highest level this launch made: its campaigns, else its ad sets, else its ads.
    let targets = ctx.nodes.filter((n) => made(n) && n.level === "campaign" && n.action === "create");
    if (!targets.length) targets = ctx.nodes.filter((n) => made(n) && n.level === "adset");
    if (!targets.length) targets = ctx.nodes.filter((n) => made(n) && n.level === "ad");
    const ads = ctx.nodes.filter((n) => n.platform === p && n.level === "ad" && n.platform_id && BUILT.includes(n.state));
    if (p === "meta") {
      const list = on ? [...ads, ...ctx.nodes.filter((n) => made(n) && n.level === "adset"), ...targets.filter((t) => t.level === "campaign")] : targets;
      for (const n of list) {
        const r = await metaSetStatus(n.platform_id!, on ? "ACTIVE" : "PAUSED");
        if (!r.ok) errors.push(`${n.name}: ${(await classify("meta", r)).message}`);
      }
    } else {
      const adv = ctx.account.tiktok_advertiser_id!;
      const groups: [("campaign" | "adset" | "ad"), NodeRow[]][] = on
        ? [["ad", ads], ["adset", ctx.nodes.filter((n) => made(n) && n.level === "adset")], ["campaign", targets.filter((t) => t.level === "campaign")]]
        : [[targets[0]?.level === "campaign" ? "campaign" : targets[0]?.level === "adset" ? "adset" : "ad", targets]];
      for (const [level, list] of groups) {
        if (!list.length) continue;
        const r = await tiktokSetStatus(adv, level, list.map((n) => n.platform_id!), on ? "ENABLE" : "DISABLE");
        if (!r.ok) errors.push((await classify("tiktok", r)).message);
      }
    }
    for (const a of ads) {
      if (on && a.state === "paused") await saveNode(ctx, a, { state: "in_review", platform_extra: { ...a.platform_extra, activated: true } });
      if (!on && ["in_review", "live", "scheduled"].includes(a.state)) await saveNode(ctx, a, { state: "paused" });
    }
    if (on) for (const n of ctx.nodes.filter((x) => made(x) && (x.level === "adset" || x.level === "campaign"))) await saveNode(ctx, n, { platform_extra: { ...n.platform_extra, activated: true } });
  }
  if (!on) await saveLaunch(launch, { state: "paused", next_run_at: null });
  else await saveLaunch(launch, { state: "in_review", activated_at: launch.activated_at ?? nowIso(), next_run_at: inSeconds(60) });
  return errors;
}
