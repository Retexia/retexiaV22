import "server-only";

import { exchangeCode, listPages, metaAppId, metaConfig, metaVersion } from "./meta";
import { designConfigured, requestMetaConnect, type ConnectedPage } from "./n8n";
import type { PostDb } from "./post-db";

/**
 * "Connect Facebook & Instagram" can run when the Meta app id is set and either
 * this app has the app secret (it exchanges the code itself) or the n8n worker is
 * connected (n8n exchanges it, holding the secret).
 */
export const canConnectMeta = () => Boolean(metaAppId() && (metaConfig() || designConfigured()));

type Result = { ok: true; pages: ConnectedPage[]; turnedOff: number } | { ok: false; error: string };

/**
 * The 3 Graph calls, then every granted Page (and its Instagram) is saved with
 * post.admin_connect_page() for this business; accounts beyond the plan are switched off.
 */
export async function connectWithCode(db: PostDb, businessId: string, code: string, redirectUri: string): Promise<Result> {
  if (!metaConfig()) {
    const r = await requestMetaConnect({ business_id: businessId, code, redirect_uri: redirectUri, graph_version: metaVersion() });
    return r.ok ? { ok: true, pages: r.pages, turnedOff: r.turned_off } : r;
  }

  const user = await exchangeCode(code, redirectUri);
  if (!user.ok) return { ok: false, error: user.error.message };
  const list = await listPages(user.data.token);
  if (!list.ok) return { ok: false, error: list.error.message };

  const pages: ConnectedPage[] = [];
  for (const p of list.data) {
    const page: ConnectedPage = {
      fb_page_id: p.id,
      fb_page_name: p.name,
      ig_account_id: p.instagram_business_account?.id ?? null,
      ig_username: p.instagram_business_account?.username ?? null,
    };
    const { error } = await db.rpc("admin_connect_page", {
      p_business: businessId,
      p_page_id: page.fb_page_id,
      p_token: p.access_token,
      p_instagram_id: page.ig_account_id,
      p_page_name: page.fb_page_name,
      p_instagram_name: page.ig_username,
    });
    if (error) return { ok: false, error: "Couldn't save the accounts. Try again." };
    pages.push(page);
  }
  // Remember who connected them (used when they remove the app from Facebook).
  if (user.data.userId && pages.length) {
    const ids = pages.flatMap((p) => [p.fb_page_id, p.ig_account_id].filter((x): x is string => Boolean(x)));
    await db.from("social_accounts").update({ meta_user_id: user.data.userId }).eq("business_id", businessId).in("external_id", ids);
  }
  const { data: off } = pages.length ? await db.rpc("enforce_account_limit", { p_business: businessId }) : { data: 0 };
  return { ok: true, pages, turnedOff: Number(off ?? 0) };
}
