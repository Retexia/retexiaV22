import "server-only";

import { redirect } from "next/navigation";
import { getFeeder, requireFeederPage } from "../access";
import { feederDb } from "../db";
import { readSettings, type CommentSettings } from "./rules";

export const AUTO_COMMENT_SLUG = "auto-comment";

/** For Auto comment pages: signed in, and the (free) package is on the account. */
export async function requireAutoCommentPage(path = "/auto-comment") {
  const feeder = await requireFeederPage(path);
  if (!feeder.packages.some((p) => p.slug === AUTO_COMMENT_SLUG && p.owned)) redirect("/");
  return feeder;
}

/** For server actions: the customer (or the customer a Retexia admin opened in support mode). */
export async function autoCommentUser() {
  const feeder = await getFeeder();
  if (!feeder) return null;
  if (!feeder.packages.some((p) => p.slug === AUTO_COMMENT_SLUG && p.owned)) return null;
  return feeder.user;
}

export type CommentStatus = {
  settings: CommentSettings;
  saved: boolean;
  started_at: string | null;
  last_checked_at: string | null;
  problem: string | null;
  page: { id: string | null; status: string; name: string | null };
};

export async function getCommentStatus(userId: string): Promise<CommentStatus> {
  const db = feederDb();
  const [{ data: row }, { data: account }] = await Promise.all([
    db.from("comment_settings").select("*").eq("user_id", userId).maybeSingle(),
    db.from("ad_accounts").select("meta_page_id, meta_status, meta_info").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    settings: readSettings(row),
    saved: Boolean(row),
    started_at: (row?.started_at as string | null) ?? null,
    last_checked_at: (row?.last_checked_at as string | null) ?? null,
    problem: (row?.problem as string | null) ?? null,
    page: {
      id: (account?.meta_page_id as string | null) ?? null,
      status: (account?.meta_status as string | null) ?? "none",
      name: ((account?.meta_info as { page_name?: string } | null)?.page_name as string | undefined) ?? null,
    },
  };
}

export type LogItem = {
  id: number;
  kind: "comment" | "first_comment";
  post_kind: "ad" | "post";
  author: string | null;
  message: string | null;
  rule: string | null;
  done: string[];
  reply: string | null;
  private_text: string | null;
  hidden_why: string | null;
  error: string | null;
  status: "done" | "partly" | "failed" | "skipped";
  created_at: string;
};

export async function listCommentLog(userId: string, limit = 50): Promise<LogItem[]> {
  const { data, error } = await feederDb()
    .from("comment_log")
    .select("id, kind, post_kind, author, message, rule, done, reply, private_text, hidden_why, error, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Auto comment log: ${error.message}`);
  return (data ?? []) as LogItem[];
}

/** What happened in the last 24 hours. */
export async function commentStats(userId: string) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await feederDb().from("comment_log").select("done").eq("user_id", userId).gte("created_at", since).limit(2000);
  const rows = (data ?? []) as { done: string[] }[];
  const n = (k: string) => rows.filter((r) => r.done?.includes(k)).length;
  return { replied: n("replied"), private: n("private"), hidden: n("hidden"), first: n("first_comment") };
}
