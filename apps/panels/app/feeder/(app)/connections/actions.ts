"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, run, type ActionResult } from "@/lib/action";
import { getFeeder } from "@/lib/feeder/access";
import { feederDb } from "@/lib/feeder/db";
import { forgetToken } from "@/lib/feeder/meta-connection";
import { discover, refresh, saveDiscovery, syncAutopublish } from "@/lib/feeder/meta-portfolio";
import { ownsAny, USES } from "@/lib/feeder/shared";

/** Sellers with a tool that uses Facebook (Autopublish, Auto comment); which tools they own decides what they may choose. */
async function seller() {
  const feeder = await getFeeder();
  if (!feeder || !ownsAny(feeder.packages, USES.ads)) throw new AccessError("Please sign in again.");
  return {
    id: feeder.user.id,
    autopublish: ownsAny(feeder.packages, ["autopublish"]),
    comments: ownsAny(feeder.packages, ["auto-comment"]),
  };
}

const done = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

const connectInput = z.object({
  business_id: z.string().trim().transform((v) => v.replace(/\s+/g, "")).refine((v) => /^\d{5,25}$/.test(v), "Numbers only: Business settings → Business info → Business portfolio ID"),
  token: z.string().trim().min(40, "Paste the whole token (it's long)").max(1000).refine((v) => !/\s/.test(v), "The token has no spaces: copy it again"),
});

/** Connect (or replace the token): looked up with Facebook first, saved only when it works. */
export async function connectMeta(input: z.input<typeof connectInput>): Promise<ActionResult> {
  return run(async () => {
    const u = await seller();
    const d = connectInput.parse(input);
    const found = await discover(d.token, d.business_id);
    if (!found.ok) return { ok: false, message: found.problem ?? "That didn't work.", fieldErrors: { token: found.problem ?? "Check the token" } };
    const { error } = await feederDb().rpc("save_meta_token", { p_user: u.id, p_business: d.business_id, p_token: d.token });
    if (error) return { ok: false, message: "Couldn't save the token. Please try again." };
    forgetToken(u.id);
    await saveDiscovery(u.id, found);
    const n = `${found.adAccounts.length} ad account${found.adAccounts.length === 1 ? "" : "s"} and ${found.pages.length} Page${found.pages.length === 1 ? "" : "s"}`;
    return done(`Connected: ${n} in ${found.business_name ?? "your portfolio"}.`);
  });
}

export async function checkMeta(): Promise<ActionResult> {
  return run(async () => {
    const u = await seller();
    const d = await refresh(u.id);
    if (!d) return { ok: false, message: "Connect your Business portfolio first." };
    return d.ok ? done("Checked with Facebook.") : { ok: false, message: d.problem ?? "Facebook needs attention." };
  });
}

const choicesInput = z.object({
  ad_accounts: z.array(z.string().regex(/^\d{5,25}$/)).max(25),
  default_ad_account: z.string().regex(/^\d{5,25}$/).nullable(),
  ads_page: z.string().regex(/^\d{5,25}$/).nullable(),
  comment_pages: z.array(z.string().regex(/^\d{5,25}$/)).max(2, "Auto comment works on at most 2 Pages"),
});

/** Which ad accounts Autopublish may use (and the default), its Page, and up to 2 Pages for Auto comment. Only assets found in the seller's portfolio. */
export async function saveMetaChoices(input: z.input<typeof choicesInput>): Promise<ActionResult> {
  return run(async () => {
    const u = await seller();
    const d = choicesInput.parse(input);
    const db = feederDb();
    const { data: assets } = await db.from("meta_assets").select("kind, asset_id, status, for_comments").eq("user_id", u.id);
    const usable = (kind: string, id: string) => (assets ?? []).some((a) => a.kind === kind && a.asset_id === id && a.status !== "gone");
    if (d.ad_accounts.some((id) => !usable("ad_account", id)) || (d.ads_page && !usable("page", d.ads_page)) || d.comment_pages.some((id) => !usable("page", id))) {
      return { ok: false, message: "Something you picked isn't in your Business portfolio any more. Press Check again." };
    }
    if (u.autopublish) {
      const chosen = new Set(d.ad_accounts);
      const def = d.default_ad_account && chosen.has(d.default_ad_account) ? d.default_ad_account : d.ad_accounts[0] ?? null;
      await db.from("meta_assets").update({ is_default: false }).eq("user_id", u.id).eq("kind", "ad_account");
      await db.from("meta_assets").update({ for_autopublish: false }).eq("user_id", u.id).eq("kind", "ad_account");
      if (d.ad_accounts.length) await db.from("meta_assets").update({ for_autopublish: true }).eq("user_id", u.id).eq("kind", "ad_account").in("asset_id", d.ad_accounts);
      if (def) await db.from("meta_assets").update({ is_default: true }).eq("user_id", u.id).eq("kind", "ad_account").eq("asset_id", def);
      await db.from("meta_assets").update({ is_default: false }).eq("user_id", u.id).eq("kind", "page");
      if (d.ads_page) await db.from("meta_assets").update({ is_default: true }).eq("user_id", u.id).eq("kind", "page").eq("asset_id", d.ads_page);
    }
    if (u.comments) {
      await db.from("meta_assets").update({ for_comments: false }).eq("user_id", u.id).eq("kind", "page");
      if (d.comment_pages.length) {
        const { error } = await db.from("meta_assets").update({ for_comments: true }).eq("user_id", u.id).eq("kind", "page").in("asset_id", d.comment_pages);
        if (error?.code === "23505") return { ok: false, message: "One of these Pages already answers its comments through another Retexia account." };
        if (error) return { ok: false, message: error.message.includes("at most 2") ? "Auto comment works on at most 2 Pages." : "Couldn't save. Please try again." };
      }
    }
    if (u.autopublish) await syncAutopublish(u.id);
    return done("Saved.");
  });
}

export async function disconnectMeta(): Promise<ActionResult> {
  return run(async () => {
    const u = await seller();
    const { error } = await feederDb().rpc("remove_meta_connection", { p_user: u.id });
    if (error) return { ok: false, message: "Couldn't disconnect. Please try again." };
    forgetToken(u.id);
    await feederDb().from("comment_settings").update({ enabled: false }).eq("user_id", u.id);
    return done("Disconnected. The token was deleted.");
  });
}
