"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, dbMessage, run, type ActionResult } from "@/lib/action";
import { autoCommentUser } from "@/lib/feeder/auto-comment/data";
import { defaultSettings, LIMITS } from "@/lib/feeder/auto-comment/rules";
import { checkComments, type CheckCounts } from "@/lib/feeder/auto-comment/runner";
import { feederDb } from "@/lib/feeder/db";

async function user() {
  const u = await autoCommentUser();
  if (!u) throw new AccessError("Please sign in again.");
  return u;
}

const text = (label: string) => z.string().trim().max(LIMITS.text, `${label}: at most ${LIMITS.text} characters`);
const words = (max: number) =>
  z
    .array(z.string().trim().max(80, "Words: at most 80 characters each"))
    .max(max)
    .transform((v) => [...new Set(v.filter(Boolean))]);

const settingsInput = z
  .object({
    reply_on: z.boolean(),
    replies: z.array(text("Reply")).max(LIMITS.replies).transform((v) => v.filter(Boolean)),
    rules: z
      .array(z.object({ words: words(LIMITS.words), reply: text("Rule reply"), private: text("Rule private message").default("") }))
      .max(LIMITS.rules, `At most ${LIMITS.rules} rules`)
      .transform((v) => v.filter((r) => r.words.length && (r.reply || r.private))),
    private_on: z.boolean(),
    private_text: text("Private message"),
    first_on: z.boolean(),
    first_text: text("First comment"),
    first_on_ads: z.boolean(),
    first_on_posts: z.boolean(),
    hide_on: z.boolean(),
    hide_phones: z.boolean(),
    hide_links: z.boolean(),
    hide_words: words(LIMITS.hideWords),
  })
  .superRefine((v, ctx) => {
    if (v.reply_on && !v.replies.length) ctx.addIssue({ code: "custom", path: ["replies"], message: "Add at least one reply, or switch replies off." });
    if (v.private_on && !v.private_text) ctx.addIssue({ code: "custom", path: ["private_text"], message: "Write the private message, or switch it off." });
    if (v.first_on && !v.first_text) ctx.addIssue({ code: "custom", path: ["first_text"], message: "Write the first comment, or switch it off." });
    if (v.first_on && !v.first_on_ads && !v.first_on_posts) ctx.addIssue({ code: "custom", path: ["first_on_ads"], message: "Choose ads, posts or both." });
  });

export type SettingsInput = z.input<typeof settingsInput>;

export async function saveCommentSettings(input: SettingsInput): Promise<ActionResult> {
  return run(async () => {
    const u = await user();
    const v = settingsInput.parse(input);
    const { error } = await feederDb().from("comment_settings").upsert({ user_id: u.id, ...v }, { onConflict: "user_id" });
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved. The next comments use these settings." };
  });
}

export async function setAutoComment(on: boolean): Promise<ActionResult> {
  return run(async () => {
    const u = await user();
    const enabled = z.boolean().parse(on);
    const db = feederDb();
    const { data: account } = await db.from("ad_accounts").select("meta_page_id, meta_status").eq("user_id", u.id).maybeSingle();
    if (enabled && (!account?.meta_page_id || account.meta_status !== "connected")) {
      return { ok: false, message: "Connect your Facebook Page first (Autopublish → Accounts). Auto comment starts once Retexia confirms it." };
    }
    const { data: existing } = await db.from("comment_settings").select("user_id").eq("user_id", u.id).maybeSingle();
    // The first time: start from the ready-made replies and rules.
    const { error } = existing
      ? await db.from("comment_settings").update({ enabled }).eq("user_id", u.id)
      : await db.from("comment_settings").insert({ user_id: u.id, ...defaultSettings(), enabled });
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: enabled ? "Auto comment is on. New comments get answered within a minute." : "Auto comment is off." };
  });
}

/** "Check now": the same check the clock runs, for this customer only. */
export async function checkNow(): Promise<ActionResult<CheckCounts>> {
  return run(async () => {
    const u = await user();
    const { data: row } = await feederDb().from("comment_settings").select("enabled").eq("user_id", u.id).maybeSingle();
    if (!row?.enabled) return { ok: false, message: "Switch Auto comment on first." };
    const r = await checkComments({ userId: u.id, budgetMs: 50_000 });
    revalidatePath("/", "layout");
    if (!r.users) return { ok: true, message: "A check is already running. Look again in a minute." };
    const { data: after } = await feederDb().from("comment_settings").select("problem").eq("user_id", u.id).maybeSingle();
    if (after?.problem) return { ok: false, message: after.problem };
    const c = r.counts;
    const total = c.replied + c.private + c.hidden + c.first;
    return {
      ok: true,
      data: c,
      message: total
        ? `Done: ${[c.replied && `${c.replied} replied`, c.private && `${c.private} private messages`, c.hidden && `${c.hidden} hidden`, c.first && `${c.first} first comments`].filter(Boolean).join(", ")}.`
        : "Checked. No new comments since the last check.",
    };
  });
}
