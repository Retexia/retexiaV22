"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { pendingConnection } from "@/lib/post/meta-connect";
import { PLAN_LIMITS } from "@/lib/post/plans";
import { requireBusiness } from "@/lib/post/session";

const uuid = z.uuid();
const graphId = z.string().regex(/^\d{1,30}$/);

/**
 * Save the Pages and Instagram accounts the owner picked after "Continue with
 * Facebook". Each Page token goes to Vault; Instagram publishes with its
 * Page's token. The user token is deleted afterwards.
 */
export async function saveMetaAccounts(input: { connectId: string; pages: string[]; instagram: string[] }): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const d = z.object({ connectId: uuid, pages: z.array(graphId).max(20), instagram: z.array(graphId).max(20) }).parse(input);
    if (!d.pages.length && !d.instagram.length) return { ok: false, message: "Pick at least one Page or Instagram account." };
    const pending = await pendingConnection(db, business.id, d.connectId);
    if (!pending) return { ok: false, message: "That connection expired. Press Continue with Facebook again." };
    if (pending.error) return { ok: false, message: `Facebook: ${pending.error}` };

    const { data: current } = await db.from("social_accounts").select("id, platform, external_id, status, token_secret_id").eq("business_id", business.id);
    const chosen: { platform: "facebook" | "instagram"; external_id: string; display_name: string; avatar_url: string | null; token: string }[] = [];
    for (const page of pending.pages) {
      if (d.pages.includes(page.id)) chosen.push({ platform: "facebook", external_id: page.id, display_name: page.name, avatar_url: page.picture?.data?.url ?? null, token: page.access_token });
      const ig = page.instagram_business_account;
      if (ig && d.instagram.includes(ig.id)) chosen.push({ platform: "instagram", external_id: ig.id, display_name: ig.username ? `@${ig.username}` : page.name, avatar_url: ig.profile_picture_url ?? null, token: page.access_token });
    }
    if (!chosen.length) return { ok: false, message: "Those accounts aren't available on this Facebook login." };

    const keep = (current ?? []).filter((a) => a.status === "connected" && !chosen.some((c) => c.platform === a.platform && c.external_id === a.external_id)).length;
    const limit = PLAN_LIMITS[business.plan].accounts;
    if (keep + chosen.length > limit) return { ok: false, message: `Your plan allows ${limit} accounts. Pick fewer, or turn off one you don't need first.` };

    for (const c of chosen) {
      const existing = (current ?? []).find((a) => a.platform === c.platform && a.external_id === c.external_id);
      const { data: secret, error: secretError } = await db.rpc("save_secret", { p_secret: existing?.token_secret_id ?? null, p_value: c.token });
      if (secretError || !secret) return { ok: false, message: "Couldn't store the access safely. Try again." };
      const row = {
        business_id: business.id,
        platform: c.platform,
        external_id: c.external_id,
        display_name: c.display_name,
        avatar_url: c.avatar_url,
        meta_user_id: pending.conn.meta_user_id,
        ig_account_type: c.platform === "instagram" ? ("business" as const) : null,
        token_secret_id: secret,
        token_expires_at: null,
        status: "connected" as const,
        enabled: true,
      };
      const { error } = existing ? await db.from("social_accounts").update(row).eq("id", existing.id) : await db.from("social_accounts").insert(row);
      if (error) return { ok: false, message: dbMessage(error) };
    }
    if (pending.conn.token_secret_id) await db.rpc("delete_secret", { p_secret: pending.conn.token_secret_id });
    await db.from("meta_connections").delete().eq("id", pending.conn.id);
    await db.from("events").insert({ business_id: business.id, type: "accounts_connected", payload: { accounts: chosen.map((c) => ({ platform: c.platform, name: c.display_name })) } });
    revalidatePath("/", "layout");
    return { ok: true, message: `${chosen.length} account${chosen.length === 1 ? "" : "s"} connected. Posts go out here from now on.` };
  });
}

export async function cancelMetaConnect(input: { connectId: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const id = uuid.parse(input.connectId);
    const { data: conn } = await db.from("meta_connections").select("id, token_secret_id").eq("id", id).eq("business_id", business.id).maybeSingle();
    if (conn?.token_secret_id) await db.rpc("delete_secret", { p_secret: conn.token_secret_id });
    if (conn) await db.from("meta_connections").delete().eq("id", conn.id);
    return { ok: true };
  });
}

/** Disconnect an account: stop posting there and delete its access token. */
export async function disconnectAccount(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { db, business } = await requireBusiness();
    const id = uuid.parse(input.id);
    const { data: a } = await db.from("social_accounts").select("id, token_secret_id, platform").eq("id", id).eq("business_id", business.id).maybeSingle();
    if (!a) return { ok: false, message: "Account not found." };
    if (a.token_secret_id) await db.rpc("delete_secret", { p_secret: a.token_secret_id });
    const { error } = await db.from("social_accounts").update({ status: "disconnected", enabled: false, token_secret_id: null }).eq("id", a.id);
    if (error) return { ok: false, message: dbMessage(error) };
    await db.from("events").insert({ business_id: business.id, type: "account_disconnected", payload: { platform: a.platform } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Disconnected. Nothing is posted there any more." };
  });
}
