import "server-only";

import type { PostDb } from "./post-db";
import type { BusinessRow, PostRow, Variants } from "./post-db.types";
import { readSettings } from "./session";
import { dayLabel, localDate, timeIn } from "../time";

/**
 * WhatsApp messages to business owners, from Retexia's own WhatsApp line on the
 * Evolution server (EVOLUTION_API_URL / EVOLUTION_API_KEY, instance
 * POST_WHATSAPP_INSTANCE). Owners choose them in Playlist and settings:
 *   items:     each post/story picture with its caption once it is ready (again after a redo);
 *   published: when it went out;
 *   alerts:    when something needs them (design failed, publishing failed or blocked).
 * Never during the owner's quiet hours: those messages wait until the quiet time ends.
 * Runs every 5 minutes with the playlist cycle; posts.wa_* remember what was sent.
 */

const PANEL = () => (process.env.POST_PANEL_URL || "https://post.retexia.com").replace(/\/+$/, "");

function sender() {
  const url = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "");
  const key = process.env.POST_WHATSAPP_KEY?.trim() || process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.POST_WHATSAPP_INSTANCE?.trim();
  return url && key && instance ? { url, key, instance } : null;
}
export const whatsAppConfigured = () => Boolean(sender());

async function evo(path: string, body: Record<string, unknown>) {
  const s = sender()!;
  try {
    const res = await fetch(`${s.url}${path}/${encodeURIComponent(s.instance)}`, {
      method: "POST",
      headers: { apikey: s.key, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Evolution v2 body first, then v1. */
async function sendText(number: string, text: string) {
  return (await evo("/message/sendText", { number, text, linkPreview: false })) || (await evo("/message/sendText", { number, textMessage: { text } }));
}

async function sendImage(number: string, url: string, caption: string) {
  const v2 = { number, mediatype: "image", mimetype: "image/jpeg", media: url, caption, fileName: "retexia.jpg" };
  return (await evo("/message/sendMedia", v2)) || (await evo("/message/sendMedia", { number, mediaMessage: { mediatype: "image", media: url, caption, fileName: "retexia.jpg" } }));
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Inside quiet hours [from, until), which may cross midnight. */
export function isQuiet(now: string, [from, until]: [string, string]) {
  const n = minutes(now);
  const f = minutes(from);
  const u = minutes(until);
  if (f === u) return false;
  return f < u ? n >= f && n < u : n >= f || n < u;
}

const to12h = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3)} ${h < 12 ? "AM" : "PM"}`;
};

function whenLine(p: PostRow, b: BusinessRow) {
  const day = dayLabel(localDate(b.timezone, new Date(p.scheduled_at)), localDate(b.timezone));
  return `${p.is_story ? "📱 Story" : "📅 Post"} · ${day} ${to12h(timeIn(b.timezone, p.scheduled_at))}`;
}

const captionOf = (p: PostRow) => {
  const v = (p.variants ?? {}) as Variants;
  return (v.facebook?.caption || v.instagram?.caption || p.caption || "").trim();
};

/** Text sent with the picture (WhatsApp captions are cut at about 1,000 characters). */
export function itemMessage(p: PostRow, b: BusinessRow, autoPublish: boolean) {
  const caption = captionOf(p);
  const link = `${PANEL()}/posts/${p.id}`;
  const next = p.status === "approved" || autoPublish ? `Goes out by itself at its time. To change or delete it: ${link}` : `Waiting for your approval: ${link}`;
  return [whenLine(p, b), caption ? `\n${caption.length > 800 ? `${caption.slice(0, 800)}…` : caption}` : p.is_story ? "\n(Stories have no caption.)" : "", `\n${next}`].join("\n");
}

const ALERT_TEXT: Record<string, string> = {
  needs_manual: "couldn't be designed",
  failed: "couldn't be published",
  blocked: "was stopped by the safety check",
};

const MAX_PER_RUN = 40;

export async function sendOwnerMessages(db: PostDb) {
  if (!sender()) return { sent: 0, configured: false };
  const { data: rows } = await db.from("businesses").select("*").eq("settings->whatsapp->>enabled", "true").limit(200);
  const now = Date.now();
  let sent = 0;

  for (const b of (rows ?? []) as BusinessRow[]) {
    if (sent >= MAX_PER_RUN) break;
    const s = readSettings(b);
    const number = s.whatsapp.number?.replace(/[^\d]/g, "");
    if (!number || !s.whatsapp.types.length) continue;
    if (isQuiet(timeIn(b.timezone, new Date(now).toISOString()), s.whatsapp.quiet_hours)) continue;
    const types = new Set(s.whatsapp.types);

    const [{ data: ready }, { data: published }, { data: problems }] = await Promise.all([
      types.has("items")
        ? db
            .from("posts")
            .select("*")
            .eq("business_id", b.id)
            .in("status", ["ready", "approved"])
            .not("media_id", "is", null)
            .gt("scheduled_at", new Date(now).toISOString())
            .lt("scheduled_at", new Date(now + 36 * 3600_000).toISOString())
            .order("scheduled_at")
            .limit(20)
        : { data: [] },
      types.has("published")
        ? db.from("posts").select("*").eq("business_id", b.id).eq("status", "published").is("wa_published_at", null).gt("updated_at", new Date(now - 6 * 3600_000).toISOString()).limit(10)
        : { data: [] },
      types.has("alerts")
        ? db.from("posts").select("*").eq("business_id", b.id).in("status", ["needs_manual", "failed", "blocked"]).gt("updated_at", new Date(now - 24 * 3600_000).toISOString()).limit(10)
        : { data: [] },
    ]);

    // Each picture with its caption (once per picture: a redo sends the new one).
    const items = ((ready ?? []) as PostRow[]).filter((p) => p.media_id && p.wa_media_id !== p.media_id);
    if (items.length) {
      const { data: media } = await db.from("media").select("id, storage_path").in("id", items.map((p) => p.media_id!));
      for (const p of items) {
        if (sent >= MAX_PER_RUN) break;
        const m = (media ?? []).find((x) => x.id === p.media_id);
        if (!m) continue;
        const { data: signed } = await db.storage.from("media").createSignedUrl(m.storage_path, 24 * 3600);
        if (!signed?.signedUrl) continue;
        if (await sendImage(number, signed.signedUrl, itemMessage(p, b, s.auto_publish))) {
          await db.from("posts").update({ wa_media_id: p.media_id }).eq("id", p.id);
          sent++;
        }
      }
    }

    for (const p of (published ?? []) as PostRow[]) {
      if (sent >= MAX_PER_RUN) break;
      const what = p.is_story ? "Your story" : "Your post";
      const ok = await sendText(number, `✅ ${what} for ${dayLabel(p.local_date, localDate(b.timezone))} ${to12h(timeIn(b.timezone, p.scheduled_at))} is live on Facebook and Instagram.\n${PANEL()}/posts/${p.id}`);
      if (ok) {
        await db.from("posts").update({ wa_published_at: new Date().toISOString() }).eq("id", p.id);
        sent++;
      }
    }

    for (const p of ((problems ?? []) as PostRow[]).filter((x) => x.wa_alert !== x.status)) {
      if (sent >= MAX_PER_RUN) break;
      const reason = p.deny_reason ? `\nReason: ${p.deny_reason}` : "";
      const ok = await sendText(number, `⚠️ ${whenLine(p, b)} ${ALERT_TEXT[p.status] ?? "needs you"}.${reason}\nOpen it to fix it: ${PANEL()}/posts/${p.id}`);
      if (ok) {
        await db.from("posts").update({ wa_alert: p.status }).eq("id", p.id);
        sent++;
      }
    }
  }
  return { sent, configured: true };
}

/** A test message from the settings page. */
export async function sendTestMessage(number: string, businessName: string) {
  if (!sender()) return { ok: false as const, error: "Retexia's WhatsApp line is not set up yet (POST_WHATSAPP_INSTANCE)." };
  const ok = await sendText(number.replace(/[^\d]/g, ""), `👋 This is Retexia Post for ${businessName}. You'll get your posts and stories here with their captions before they go out.`);
  return ok ? { ok: true as const } : { ok: false as const, error: "WhatsApp didn't accept the message. Check the number (with country code)." };
}
