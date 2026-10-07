import "server-only";

import { listPages, type MetaPage } from "./meta";
import type { PostDb } from "./post-db";

/** A "Continue with Facebook" in progress for this business (under an hour old), with its Pages. */
export async function pendingConnection(db: PostDb, businessId: string, connectId: string) {
  const { data: conn } = await db.from("meta_connections").select("*").eq("id", connectId).eq("business_id", businessId).maybeSingle();
  if (!conn?.token_secret_id || Date.now() - new Date(conn.created_at).getTime() > 3600_000) return null;
  const { data: token } = await db.rpc("read_secret", { p_secret: conn.token_secret_id });
  if (!token) return null;
  const pages = await listPages(token);
  return { conn, pages: pages.ok ? pages.data : ([] as MetaPage[]), error: pages.ok ? null : pages.error.message };
}

/** What the browser may see about a Page (never its token). */
export const pageOption = (p: MetaPage) => ({
  id: p.id,
  name: p.name,
  picture: p.picture?.data?.url ?? null,
  instagram: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? null, picture: p.instagram_business_account.profile_picture_url ?? null } : null,
});
export type PageOption = ReturnType<typeof pageOption>;
