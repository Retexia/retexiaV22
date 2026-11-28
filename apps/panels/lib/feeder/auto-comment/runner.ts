import "server-only";

import { gateway, gatewayReady, type GatewayReply } from "../autopublish/gateway";
import { feederDb } from "../db";
import { askAi, sellerFacts } from "./ai";
import { combine, type AiResult } from "./ai-prompt";
import { decide, readSettings, type CommentSettings } from "./rules";

/**
 * Auto comment's checker. Every minute (pg_cron → /api/feeder/auto-comment/tick),
 * or when the customer presses "Check now":
 *   1. read the newest Page posts and ads (with their newest comments) through the
 *      n8n gateway, which uses the Page's own token;
 *   2. post the Page's first comment on new ads / posts;
 *   3. for each new comment: hide it, reply under it, send a private message;
 *   4. log every comment once (feeder.comment_log), so nothing is done twice.
 * Only comments written after Auto comment was switched on are touched.
 */

type FbComment = { id: string; message?: string; created_time?: string; from?: { id?: string; name?: string }; is_hidden?: boolean; can_reply_privately?: boolean };
type FbPost = { id: string; created_time?: string; message?: string; comments?: { data?: FbComment[] } };
type Post = FbPost & { kind: "ad" | "post" };

export type CheckCounts = { replied: number; private: number; hidden: number; first: number; failed: number };
export type CheckResult = { users: number; counts: CheckCounts; problems: number };

const COMMENT_FIELDS = "id,message,created_time,from{id,name},is_hidden,can_reply_privately";
const POST_FIELDS = `id,created_time,message,comments.order(reverse_chronological).limit(25){${COMMENT_FIELDS}}`;
/** Facebook calls per customer per check, at most (a busy Page catches up over the next minutes). */
const MAX_ACTIONS = 40;
/** New comments handled per customer per check (the rest wait for the next minute). */
const MAX_COMMENTS = 30;

class Unreachable extends Error {}

const metaError = (r: GatewayReply): { code: number; message: string } => {
  const e = (r.body && typeof r.body === "object" ? (r.body.error ?? {}) : {}) as { code?: number; message?: string; error_user_msg?: string };
  return { code: Number(e.code) || r.status || 0, message: String(e.error_user_msg || e.message || `Facebook replied ${r.status}`).slice(0, 300) };
};

/** A plain sentence for the customer about why the Page can't be read. */
function readProblem(r: GatewayReply): string {
  if (r.network) return "Retexia couldn't reach Facebook just now. It tries again in a minute.";
  const e = metaError(r);
  if ([10, 200, 210, 230, 190, 283, 299].includes(e.code) || /permission|access token/i.test(e.message)) {
    return `Facebook didn't let Retexia read this Page's comments (${e.message}). The Page must be shared with Retexia's business, and Retexia's token needs the pages_read_engagement, pages_read_user_content and pages_manage_engagement permissions.`;
  }
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return "Facebook asked Retexia to slow down for a few minutes. It tries again shortly.";
  return `Facebook said: ${e.message}`;
}

async function call(page: string, method: "GET" | "POST", path: string, params: Record<string, unknown>) {
  const r = await gateway({ action: "meta_page", method, page_id: page, path, params }, 60_000);
  if (r.network) throw new Unreachable(String(r.body?.error?.message ?? "gateway unreachable"));
  return r;
}

const after = (iso: string | undefined, start: number) => (iso ? new Date(iso).getTime() >= start - 5_000 : false);

/** One customer's check. Returns the problem to show (or null) and what was done. */
async function checkOne(row: Record<string, unknown>, counts: CheckCounts): Promise<string | null> {
  const db = feederDb();
  const userId = String(row.user_id);
  const s: CommentSettings = readSettings(row as Partial<Record<keyof CommentSettings, unknown>>);
  const start = row.started_at ? new Date(String(row.started_at)).getTime() : Date.now();

  const { data: account } = await db.from("ad_accounts").select("meta_page_id, meta_status").eq("user_id", userId).maybeSingle();
  const page = account?.meta_page_id as string | null | undefined;
  if (!page || account?.meta_status !== "connected") return "Connect your Facebook Page first: Autopublish → Accounts. Auto comment starts once Retexia confirms it.";
  if (!gatewayReady()) return "Retexia's Facebook connection isn't set up on the server yet (FEEDER_ADS_N8N_URL / KEY).";

  const [ads, posts] = await Promise.all([
    call(page, "GET", `${page}/ads_posts`, { fields: POST_FIELDS, limit: 10, include_inline_create: true }),
    call(page, "GET", `${page}/posts`, { fields: POST_FIELDS, limit: 10 }),
  ]);
  if (!ads.ok && !posts.ok) return readProblem(posts);
  const list: Post[] = [
    ...(ads.ok ? ((ads.body?.data ?? []) as FbPost[]).map((p) => ({ ...p, kind: "ad" as const })) : []),
    ...(posts.ok ? ((posts.body?.data ?? []) as FbPost[]).map((p) => ({ ...p, kind: "post" as const })) : []),
  ];
  const seenPost = new Set<string>();
  const unique = list.filter((p) => p?.id && !seenPost.has(p.id) && seenPost.add(p.id));

  const comments = unique.flatMap((p) => (p.comments?.data ?? []).map((c) => ({ c, post: p })));
  const ids = comments.map((x) => x.c.id).filter(Boolean);
  const postIds = unique.map((p) => p.id);
  const [{ data: doneRows }, { data: firstRows }] = await Promise.all([
    ids.length ? db.from("comment_log").select("comment_id").eq("user_id", userId).in("dedupe", ids.map((x) => `c:${x}`)) : Promise.resolve({ data: [] as { comment_id: string }[] }),
    postIds.length ? db.from("comment_log").select("post_id").eq("user_id", userId).in("dedupe", postIds.map((x) => `first:${x}`)) : Promise.resolve({ data: [] as { post_id: string }[] }),
  ]);
  const done = new Set((doneRows ?? []).map((r) => r.comment_id));
  const firstDone = new Set((firstRows ?? []).map((r) => r.post_id));
  let actions = 0;
  /** Claims a comment / first comment BEFORE acting: false when it was already handled. */
  const claim = async (entry: Record<string, unknown>): Promise<number | null> => {
    const { data, error } = await db
      .from("comment_log")
      .upsert({ user_id: userId, page_id: page, status: "pending", ...entry }, { onConflict: "user_id,dedupe", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Auto comment log: ${error.message}`);
    return (data?.[0]?.id as number | undefined) ?? null;
  };
  const finish = async (id: number, entry: Record<string, unknown>) => {
    const { error } = await db.from("comment_log").update(entry).eq("id", id);
    if (error) console.error("[auto comment] log update", error.message);
  };

  // The Page's first comment on new ads / posts.
  if (s.first_on && s.first_text) {
    for (const p of unique) {
      if (actions >= MAX_ACTIONS) break;
      if (firstDone.has(p.id) || !after(p.created_time, start)) continue;
      if (p.kind === "ad" ? !s.first_on_ads : !s.first_on_posts) continue;
      const id = await claim({ kind: "first_comment", dedupe: `first:${p.id}`, post_id: p.id, post_kind: p.kind, reply: s.first_text });
      if (!id) continue;
      actions++;
      const r = await call(page, "POST", `${p.id}/comments`, { message: s.first_text }).catch(async (e) => {
        await finish(id, { status: "failed", error: "Couldn't reach Facebook. Not tried again, so it is never posted twice." });
        throw e;
      });
      if (r.ok) counts.first++;
      else counts.failed++;
      await finish(id, {
        comment_id: r.ok ? String(r.body?.id ?? "") || null : null,
        done: r.ok ? ["first_comment"] : [], status: r.ok ? "done" : "failed", error: r.ok ? null : metaError(r).message,
      });
    }
  }

  // New comments, oldest first.
  const fresh = comments
    .filter(({ c }) => c.id && !done.has(c.id) && c.from?.id !== page && !c.is_hidden && after(c.created_time, start))
    .sort((a, b) => String(a.c.created_time).localeCompare(String(b.c.created_time)))
    .slice(0, MAX_COMMENTS);

  // The AI reads them all at once (with the seller's products and business details).
  let aiError: string | null = null;
  let aiTokens = 0;
  let ai = new Map<string, AiResult>();
  if (s.ai_on && fresh.length) {
    const facts = await sellerFacts(userId);
    const out = await askAi({
      settings: s,
      ...facts,
      posts: unique.map((p) => ({ id: p.id, kind: p.kind, text: p.message ?? "" })),
      comments: fresh.map(({ c, post }) => ({ id: c.id, post_id: post.id, name: (c.from?.name ?? "").split(/\s+/)[0] ?? "", text: c.message ?? "" })),
    });
    ai = out.results;
    aiError = out.error;
    aiTokens = out.tokens;
  }

  for (const { c, post } of fresh) {
    if (actions >= MAX_ACTIONS) break;
    const d = combine(decide(s, { id: c.id, message: c.message, author: c.from?.name }), ai.get(c.id));
    const id = await claim({
      kind: "comment", dedupe: `c:${c.id}`, post_id: post.id, post_kind: post.kind, comment_id: c.id,
      author: c.from?.name?.slice(0, 120) ?? null, message: (c.message ?? "").slice(0, 2000), commented_at: c.created_time ?? null,
      rule: d.rule, reply: d.reply, private_text: d.private, hidden_why: d.hide,
      ai: d.ai, product_id: d.product_id, ai_tokens: d.ai && aiTokens ? aiTokens : null,
    });
    if (d.ai) aiTokens = 0; // the batch's tokens are noted once

    if (!id) continue;
    const did: string[] = [];
    const errors: string[] = [];
    try {
      if (d.hide) {
        actions++;
        const r = await call(page, "POST", c.id, { is_hidden: true });
        if (r.ok) {
          did.push("hidden");
          counts.hidden++;
        } else errors.push(`Hide: ${metaError(r).message}`);
      }
      if (d.reply) {
        actions++;
        const r = await call(page, "POST", `${c.id}/comments`, { message: d.reply });
        if (r.ok) {
          did.push("replied");
          counts.replied++;
        } else errors.push(`Reply: ${metaError(r).message}`);
      }
      if (d.private) {
        if (c.can_reply_privately === false) errors.push("Private message: Facebook doesn't allow one on this comment (only one, within 7 days).");
        else {
          actions++;
          const r = await call(page, "POST", `${page}/messages`, { recipient: { comment_id: c.id }, message: { text: d.private } });
          if (r.ok) {
            did.push("private");
            counts.private++;
          } else errors.push(`Private message: ${metaError(r).message}`);
        }
      }
    } catch (e) {
      await finish(id, { done: did, status: did.length ? "partly" : "failed", error: "Couldn't reach Facebook. Not tried again, so nothing is sent twice." });
      throw e;
    }
    const wanted = Number(Boolean(d.hide)) + Number(Boolean(d.reply)) + Number(Boolean(d.private));
    if (errors.length) counts.failed++;
    await finish(id, {
      done: did,
      error: errors.join(" · ").slice(0, 500) || null,
      status: wanted === 0 ? "skipped" : did.length === 0 ? "failed" : errors.length ? "partly" : "done",
    });
  }

  // Reading worked; a failed half (ads or posts) or the AI is worth a word, not a stop.
  if (aiError) return `${aiError} The backup replies answered instead.`;
  if (!ads.ok) return `Comments on ads couldn't be read: ${metaError(ads).message}`;
  if (!posts.ok) return `Comments on Page posts couldn't be read: ${metaError(posts).message}`;
  return null;
}

/** Checks every customer who is due (or just one, for "Check now"). */
export async function checkComments(opts: { budgetMs?: number; userId?: string } = {}): Promise<CheckResult> {
  const db = feederDb();
  const until = Date.now() + (opts.budgetMs ?? 45_000);
  const { data, error } = await db.rpc("comment_claim", { p_limit: 20, p_user: opts.userId ?? null });
  if (error) throw new Error(`Auto comment claim: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  const counts: CheckCounts = { replied: 0, private: 0, hidden: 0, first: 0, failed: 0 };
  let problems = 0;
  for (const row of rows) {
    const userId = String(row.user_id);
    if (Date.now() > until) {
      await db.rpc("comment_release", { p_user: userId, p_problem: (row.problem as string | null) ?? null });
      continue;
    }
    let problem: string | null;
    try {
      problem = await checkOne(row, counts);
    } catch (e) {
      problem = e instanceof Unreachable ? "Retexia couldn't reach Facebook just now. It tries again in a minute." : "Something went wrong while checking the comments. It tries again in a minute.";
      if (!(e instanceof Unreachable)) console.error("[auto comment]", e);
    }
    if (problem) problems++;
    await db.rpc("comment_release", { p_user: userId, p_problem: problem });
  }
  return { users: rows.length, counts, problems };
}
