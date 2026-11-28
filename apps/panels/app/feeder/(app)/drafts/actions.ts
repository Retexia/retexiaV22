"use server";

import { z } from "zod";
import { AccessError, run, type ActionResult } from "@/lib/action";
import { getFeeder } from "@/lib/feeder/access";
import { feederDb } from "@/lib/feeder/db";

const tool = z.enum(["autopublish", "bulk_create"]);

async function sellerId() {
  const f = await getFeeder();
  if (!f) throw new AccessError("Please sign in again.");
  return f.user.id;
}

/** Keeps what the seller was setting up (quietly, while they work). */
export async function saveDraft(input: { tool: string; data: unknown }): Promise<ActionResult> {
  return run(async () => {
    const userId = await sellerId();
    const t = tool.parse(input.tool);
    const data = z.record(z.string(), z.unknown()).parse(input.data);
    if (JSON.stringify(data).length > 60_000) return { ok: false, message: "The draft is too big to keep." };
    // Uploaded files are kept only when they are this seller's own.
    const creatives = Array.isArray(data.creatives) ? data.creatives : [];
    if (creatives.some((c) => !String((c as { path?: string })?.path ?? "").startsWith(`${userId}/`))) throw new AccessError("These files don't belong to this account.");
    const { error } = await feederDb().from("drafts").upsert({ user_id: userId, tool: t, data, updated_at: new Date().toISOString() }, { onConflict: "user_id,tool" });
    return error ? { ok: false, message: "The draft couldn't be saved." } : { ok: true };
  });
}

export async function clearDraft(input: { tool: string }): Promise<ActionResult> {
  return run(async () => {
    const userId = await sellerId();
    await feederDb().from("drafts").delete().eq("user_id", userId).eq("tool", tool.parse(input.tool));
    return { ok: true };
  });
}
