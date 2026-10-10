import "server-only";

import { focusLabel, focusValue, readFocus } from "./focus";
import { mediaUrls } from "./media";
import type { PostDb } from "./post-db";
import type { PostRow, PublicationRow, Variants } from "./post-db.types";
import { isLocked, timeIn } from "../time";

export type PostView = {
  id: string;
  date: string;
  slot: number;
  time: string;
  scheduledAt: string;
  format: PostRow["format"];
  isStory: boolean;
  status: PostRow["status"];
  source: PostRow["source"];
  facebook: string;
  instagram: string;
  hashtags: string[];
  imageUrl: string | null;
  mediaId: string | null;
  regenLeft: number;
  locked: boolean;
  denyReason: string | null;
  brief: Record<string, unknown>;
  /** Playlist item (slots 1–5) or made by hand (6–10). */
  inPlaylist: boolean;
  title: string;
  prompt: string;
  captionLanguage: string | null;
  designLanguage: string | null;
  /** What it is about: drop-down value ("business", "product:<id>", "group:<id>") and its label. */
  focus: string;
  focusLabel: string;
  /** Live on at least one account (can be edited on Facebook / deleted). */
  live: boolean;
  publications: { platform: string; name: string | null; status: PublicationRow["status"]; permalink: string | null; error: string | null; publishedAt: string | null }[];
};

/** Strip the hashtag block we append to the Instagram caption. */
function igBody(caption: string, tags: string[]) {
  if (!tags.length) return caption;
  const block = `\n\n${tags.join(" ")}`;
  return caption.endsWith(block) ? caption.slice(0, -block.length) : caption;
}

export async function toViews(db: PostDb, businessId: string, tz: string, posts: PostRow[], fullImages = false): Promise<PostView[]> {
  if (!posts.length) return [];
  const mediaIds = [...new Set(posts.map((p) => p.media_id).filter((x): x is string => Boolean(x)))];
  const [{ data: media }, { data: pubs }, { data: accounts }] = await Promise.all([
    mediaIds.length ? db.from("media").select("id, storage_path, thumb_path").eq("business_id", businessId).in("id", mediaIds) : Promise.resolve({ data: [] }),
    db.from("publications").select("*").in("post_id", posts.map((p) => p.id)),
    db.from("social_accounts").select("id, platform, display_name").eq("business_id", businessId),
  ]);
  const urls = await mediaUrls(db, media ?? [], fullImages);
  const acct = new Map((accounts ?? []).map((a) => [a.id, a]));
  return posts.map((p) => {
    const v = (p.variants ?? {}) as Variants;
    const tags = (v.instagram?.hashtags ?? []).map((t) => (t.startsWith("#") ? t : `#${t}`));
    return {
      id: p.id,
      date: p.local_date,
      slot: p.slot,
      time: timeIn(tz, p.scheduled_at),
      scheduledAt: p.scheduled_at,
      format: p.format,
      isStory: p.is_story,
      status: p.status,
      source: p.source,
      facebook: v.facebook?.caption ?? p.caption ?? "",
      instagram: igBody(v.instagram?.caption ?? p.caption ?? "", tags),
      hashtags: tags.map((t) => t.replace(/^#/, "")),
      imageUrl: p.media_id ? (urls.get(p.media_id) ?? null) : null,
      mediaId: p.media_id,
      regenLeft: Math.max(0, 10 - p.regen_count),
      locked: isLocked(p.scheduled_at),
      denyReason: p.deny_reason,
      brief: (p.brief ?? {}) as Record<string, unknown>,
      inPlaylist: p.slot <= 5,
      title: String(((p.brief ?? {}) as Record<string, unknown>).title ?? ""),
      prompt: String(((p.brief ?? {}) as Record<string, unknown>).prompt ?? ""),
      captionLanguage: (((p.brief ?? {}) as Record<string, unknown>).caption_language as string | undefined) ?? null,
      designLanguage: (((p.brief ?? {}) as Record<string, unknown>).design_language as string | undefined) ?? null,
      focus: focusValue(readFocus(p.brief)),
      focusLabel: focusLabel(readFocus(p.brief)),
      live: (pubs ?? []).some((x) => x.post_id === p.id && x.status === "published"),
      publications: (pubs ?? [])
        .filter((x) => x.post_id === p.id)
        .map((x) => ({
          platform: acct.get(x.social_account_id)?.platform ?? "account",
          name: acct.get(x.social_account_id)?.display_name ?? null,
          status: x.status,
          permalink: x.permalink,
          error: x.last_error,
          publishedAt: x.published_at,
        })),
    };
  });
}
