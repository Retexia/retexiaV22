import "server-only";

import type { PostDb } from "./post-db";

/**
 * Signed URLs for private Storage files (buckets "media" and "thumbs"), valid
 * for an hour. Paths always start with the business id; callers pass only
 * paths read from that business's own rows.
 */
export async function signPaths(db: PostDb, bucket: "media" | "thumbs", paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await db.storage.from(bucket).createSignedUrls(unique, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}

/** Thumbnail (or full file) URLs for media rows, keyed by media id. */
export async function mediaUrls(db: PostDb, rows: { id: string; storage_path: string; thumb_path: string | null }[], full = false) {
  const thumbs = full ? new Map<string, string>() : await signPaths(db, "thumbs", rows.map((r) => r.thumb_path));
  const missing = rows.filter((r) => full || !r.thumb_path || !thumbs.get(r.thumb_path));
  const originals = await signPaths(db, "media", missing.map((r) => r.storage_path));
  return new Map(rows.map((r) => [r.id, (!full && r.thumb_path && thumbs.get(r.thumb_path)) || originals.get(r.storage_path) || null]));
}
