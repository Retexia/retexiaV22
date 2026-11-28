import "server-only";

import { BUCKET } from "./autopublish/runner";
import { feederDb } from "./db";

/** A seller's draft for a tool (null when there is none). */
export async function getDraft<T = Record<string, unknown>>(userId: string, tool: "autopublish" | "bulk_create"): Promise<{ data: T; updated_at: string } | null> {
  const { data } = await feederDb().from("drafts").select("data, updated_at").eq("user_id", userId).eq("tool", tool).maybeSingle();
  return data ? { data: data.data as T, updated_at: data.updated_at as string } : null;
}

export type DraftCreative = { path: string; name: string; kind: "video" | "image"; mime: string; size: number; width: number | null; height: number | null; duration: number | null };

/** Uploaded videos / images of an Autopublish draft, with short-lived links to show them again (only the seller's own, still in storage). */
export async function draftCreatives(userId: string, list: unknown): Promise<(DraftCreative & { preview: string })[]> {
  const items = (Array.isArray(list) ? list : []).filter((c): c is DraftCreative => typeof c?.path === "string" && c.path.startsWith(`${userId}/`)).slice(0, 10);
  if (!items.length) return [];
  const { data } = await feederDb().storage.from(BUCKET).createSignedUrls(items.map((c) => c.path), 6 * 3600);
  const urls = new Map((data ?? []).filter((s) => s.signedUrl && !s.error).map((s) => [s.path, s.signedUrl]));
  return items.filter((c) => urls.has(c.path)).map((c) => ({ ...c, preview: urls.get(c.path)! }));
}
