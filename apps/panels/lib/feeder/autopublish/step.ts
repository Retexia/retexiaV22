import "server-only";

import { feederDb } from "../db";
import type { GatewayReply } from "./gateway";
import type { Platform } from "./plan";
import type { AccountRow, CreativeRow, LaunchRow, NodeRow, Snapshot } from "./types";

/** What one build step sees. */
export type StepCtx = {
  launch: LaunchRow;
  snap: Snapshot;
  account: AccountRow;
  nodes: NodeRow[];
  creatives: CreativeRow[];
  node: (platform: Platform, key: string) => NodeRow | undefined;
  /** A short signed link to a creative in Storage (Meta / TikTok fetch it). */
  signedUrl: (path: string, seconds?: number) => Promise<string | null>;
};

/** What one build step returns; the runner saves it in one go. */
export type StepResult =
  | { kind: "done"; platform_id?: string | null; extra?: Record<string, unknown>; note?: string }
  /** Not ready yet (video processing): look again in `seconds`. */
  | { kind: "wait"; seconds: number; platform_id?: string | null; extra?: Record<string, unknown> }
  /** A platform error: classified by the error catalog. */
  | { kind: "error"; reply: GatewayReply; platform_id?: string | null; extra?: Record<string, unknown> }
  /** Something the customer must change (found by our own checks). */
  | { kind: "fix"; message: string; fix_field: string | null };

export const fix = (message: string, fix_field: string | null = null): StepResult => ({ kind: "fix", message, fix_field });

/** Storage couldn't sign the file's link just now: a temporary problem, retried automatically (then reported). */
export const storageHiccup = (): StepResult => ({ kind: "error", reply: { ok: false, status: 0, network: true, body: { error: { message: "network: couldn't make a link to the file in storage" } } } });

/** Same name in any capitals / spacing (like feeder.alias_key in the database). */
export const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** The evergreen slot row for this customer × platform × objective × product × budget level (reserved first). */
export async function slotRow(ctx: StepCtx, n: NodeRow) {
  const db = feederDb();
  const key = { user_id: ctx.launch.user_id, platform: n.platform, objective: ctx.snap.template.objective, product_key: nameKey(ctx.snap.product.form_name).slice(0, 200), budget_level: ctx.snap.template.structure.budget.level };
  await db.from("ad_slots").upsert(key, { onConflict: "user_id,platform,objective,product_key,budget_level", ignoreDuplicates: true });
  const { data, error } = await db.from("ad_slots").select("id, campaign_id, launches").match(key).single();
  if (error || !data) throw new Error(`slot: ${error?.message ?? "missing"}`);
  return data as { id: string; campaign_id: string | null; launches: number };
}

