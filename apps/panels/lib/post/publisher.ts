import "server-only";

import { graphGet, graphPost, type GraphError } from "./meta";
import { postDb, type PostDb } from "./post-db";
import type { Json, PostRow, PublicationRow, SocialAccountRow, Variants } from "./post-db.types";

/**
 * Publishes posts whose time has come (called every minute by the Supabase
 * scheduler, see /api/post/publish). One publications row per account, so one
 * failing account never blocks the others; nothing is posted twice: accounts
 * already published are skipped and Instagram containers are reused.
 * Temporary errors retry after 2, 5, 15 and 30 minutes (product spec).
 */

const RETRY_MINUTES = [2, 5, 15, 30];
const SUPPORTED = new Set(["photo", "story_photo"]);

type Account = Pick<SocialAccountRow, "id" | "platform" | "external_id" | "token_secret_id">;
type Outcome = { ok: true; externalId: string; permalink: string | null; containerId?: string } | { ok: false; error: GraphError; containerId?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function publishFacebook(post: PostRow, account: Account, token: string, imageUrl: string): Promise<Outcome> {
  const v = (post.variants ?? {}) as Variants;
  const message = v.facebook?.caption ?? post.caption ?? "";
  if (post.format === "story_photo") {
    const photo = await graphPost<{ id: string }>(`/${account.external_id}/photos`, { url: imageUrl, published: "false", access_token: token });
    if (!photo.ok) return photo;
    const story = await graphPost<{ post_id?: string; id?: string }>(`/${account.external_id}/photo_stories`, { photo_id: photo.data.id, access_token: token });
    if (!story.ok) return story;
    const id = story.data.post_id ?? story.data.id ?? photo.data.id;
    return { ok: true, externalId: id, permalink: null };
  }
  const r = await graphPost<{ id: string; post_id?: string }>(`/${account.external_id}/photos`, { url: imageUrl, message, access_token: token });
  if (!r.ok) return r;
  const id = r.data.post_id ?? r.data.id;
  return { ok: true, externalId: id, permalink: `https://www.facebook.com/${id}` };
}

async function publishInstagram(post: PostRow, account: Account, token: string, imageUrl: string, previousContainer: string | null): Promise<Outcome> {
  const v = (post.variants ?? {}) as Variants;
  let container = previousContainer;
  // A retry: reuse a container from the last attempt (never publish twice).
  if (container) {
    const st = await graphGet<{ status_code?: string }>(`/${container}`, { fields: "status_code", access_token: token });
    if (st.ok && st.data.status_code === "PUBLISHED") return { ok: true, externalId: container, permalink: null, containerId: container };
    if (!st.ok || st.data.status_code === "ERROR" || st.data.status_code === "EXPIRED") container = null;
  }
  if (!container) {
    const params: Record<string, string> = { image_url: imageUrl, access_token: token };
    if (post.format === "story_photo") params.media_type = "STORIES";
    else params.caption = v.instagram?.caption ?? post.caption ?? "";
    const c = await graphPost<{ id: string }>(`/${account.external_id}/media`, params);
    if (!c.ok) return c;
    container = c.data.id;
  }
  // Wait until Instagram has fetched the image (usually a few seconds).
  for (let i = 0; i < 6; i++) {
    const st = await graphGet<{ status_code?: string }>(`/${container}`, { fields: "status_code", access_token: token });
    if (st.ok && st.data.status_code === "FINISHED") break;
    if (st.ok && st.data.status_code === "ERROR") return { ok: false, error: { kind: "content", message: "Instagram couldn't process this image." }, containerId: container };
    await sleep(2000);
  }
  const pub = await graphPost<{ id: string }>(`/${account.external_id}/media_publish`, { creation_id: container, access_token: token });
  if (!pub.ok) return { ...pub, containerId: container };
  const link = await graphGet<{ permalink?: string }>(`/${pub.data.id}`, { fields: "permalink", access_token: token });
  return { ok: true, externalId: pub.data.id, permalink: link.ok ? (link.data.permalink ?? null) : null, containerId: container };
}

async function finish(db: PostDb, post: PostRow, status: PostRow["status"], event: string, payload: Record<string, unknown>, extra: Partial<PostRow> = {}) {
  await db.from("posts").update({ status, ...extra }).eq("id", post.id);
  await db.from("events").insert({ business_id: post.business_id, type: event, payload: { post_id: post.id, ...payload } as Json });
}

export async function publishPost(db: PostDb, post: PostRow): Promise<"published" | "retrying" | "failed"> {
  if (!SUPPORTED.has(post.format)) {
    await finish(db, post, "failed", "publish_failed", { reason: `${post.format} posts can't be published automatically yet. Download it and post it yourself.` });
    return "failed";
  }
  const [{ data: accounts }, { data: media }, { data: pubs }] = await Promise.all([
    db.from("social_accounts").select("id, platform, external_id, token_secret_id").eq("business_id", post.business_id).eq("enabled", true).eq("status", "connected"),
    post.media_id ? db.from("media").select("storage_path, kind").eq("id", post.media_id).eq("business_id", post.business_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("publications").select("*").eq("post_id", post.id),
  ]);
  const targets = accounts ?? [];
  if (!targets.length) {
    await finish(db, post, "failed", "publish_failed", { reason: "No Facebook or Instagram account is connected. Connect one, then press Retry." });
    return "failed";
  }
  if (!media || media.kind !== "photo") {
    await finish(db, post, "failed", "publish_failed", { reason: "This post has no photo." });
    return "failed";
  }
  const { data: signed } = await db.storage.from("media").createSignedUrl(media.storage_path, 3600);
  if (!signed?.signedUrl) {
    await finish(db, post, "approved", "publish_retry", { reason: "Could not read the image file." }, { scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString() });
    return "retrying";
  }

  const results: { platform: string; ok: boolean; error?: string; kind?: string }[] = [];
  let nextRetry: number | null = null;
  for (const account of targets) {
    let pub = (pubs ?? []).find((p) => p.social_account_id === account.id) as PublicationRow | undefined;
    if (pub?.status === "published") {
      results.push({ platform: account.platform, ok: true });
      continue;
    }
    if (pub?.status === "failed") {
      results.push({ platform: account.platform, ok: false, error: pub.last_error ?? "failed" });
      continue;
    }
    if (!pub) {
      const { data } = await db.from("publications").insert({ post_id: post.id, social_account_id: account.id, status: "publishing", attempts: 0 }).select("*").single();
      if (!data) continue;
      pub = data as PublicationRow;
    } else {
      await db.from("publications").update({ status: "publishing" }).eq("id", pub.id);
    }

    const token = account.token_secret_id ? (await db.rpc("read_secret", { p_secret: account.token_secret_id })).data : null;
    const outcome: Outcome = !token
      ? { ok: false, error: { kind: "needs_user", message: "Not connected through Retexia yet. Reconnect with Facebook." } }
      : account.platform === "facebook"
        ? await publishFacebook(post, account, token, signed.signedUrl)
        : await publishInstagram(post, account, token, signed.signedUrl, pub.container_id);

    const attempts = pub.attempts + 1;
    if (outcome.ok) {
      await db
        .from("publications")
        .update({ status: "published", attempts, external_id: outcome.externalId, permalink: outcome.permalink, container_id: outcome.containerId ?? pub.container_id, published_at: new Date().toISOString(), last_error: null, error_kind: null, next_retry_at: null })
        .eq("id", pub.id);
      results.push({ platform: account.platform, ok: true });
      continue;
    }
    const retry = outcome.error.kind === "temporary" && attempts <= RETRY_MINUTES.length;
    const at = retry ? Date.now() + RETRY_MINUTES[attempts - 1]! * 60_000 : null;
    if (at) nextRetry = nextRetry ? Math.min(nextRetry, at) : at;
    await db
      .from("publications")
      .update({
        status: retry ? "retrying" : "failed",
        attempts,
        error_kind: outcome.error.kind,
        last_error: outcome.error.message,
        container_id: outcome.containerId ?? pub.container_id,
        next_retry_at: at ? new Date(at).toISOString() : null,
      })
      .eq("id", pub.id);
    if (outcome.error.kind === "needs_user") {
      await db.from("social_accounts").update({ status: "reconnect_needed" }).eq("id", account.id);
      await db.from("events").insert({ business_id: post.business_id, type: "reconnect_needed", payload: { account_id: account.id, platform: account.platform, error: outcome.error.message } });
    }
    results.push({ platform: account.platform, ok: false, error: outcome.error.message, kind: outcome.error.kind });
  }

  if (post.media_id) await db.from("media").update({ last_used_at: new Date().toISOString() }).eq("id", post.media_id);
  const okCount = results.filter((r) => r.ok).length;
  if (nextRetry) {
    await finish(db, post, "approved", "publish_retry", { results }, { scheduled_at: new Date(nextRetry).toISOString() });
    return "retrying";
  }
  if (okCount === results.length) {
    await finish(db, post, "published", "published", { results });
    return "published";
  }
  if (okCount > 0) {
    await finish(db, post, "published", "publish_partial", { results });
    return "published";
  }
  await finish(db, post, "failed", "publish_failed", { results });
  return "failed";
}

/** Claim due posts and publish them (a few at a time, so one call stays short). */
export async function publishDuePosts(limit = 8) {
  const db = postDb();
  const { data: claimed, error } = await db.rpc("claim_due_posts", { p_limit: limit });
  if (error) throw new Error(error.message);
  const summary = { claimed: claimed?.length ?? 0, published: 0, retrying: 0, failed: 0 };
  for (const post of (claimed ?? []) as PostRow[]) {
    try {
      summary[await publishPost(db, post)]++;
    } catch (e) {
      console.error("[post publish]", post.id, e);
      await db.from("posts").update({ status: "approved", scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString() }).eq("id", post.id);
      summary.retrying++;
    }
  }
  return summary;
}
