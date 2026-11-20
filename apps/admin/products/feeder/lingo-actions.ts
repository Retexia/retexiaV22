"use server";

import { createAdminSchemaClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";

const lingo = () => createAdminSchemaClient("lingo");
const done = (message: string): ActionResult => {
  revalidatePath("/products/feeder");
  return { ok: true, message };
};

const sellerInput = z.object({
  lingo_user_id: z.coerce.number().int().positive(),
  budget: z.coerce.number().min(0).max(1000),
  status: z.enum(["setup", "live", "paused", "blocked"]),
});
/** A seller's monthly AI allowance (US$) and status (blocked = Lingo stops for them). */
export async function setLingoSeller(raw: z.input<typeof sellerInput>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = sellerInput.parse(raw);
    const db = lingo();
    const { data: before } = await db.from("bot_sellers").select("ai_monthly_budget_usd, status").eq("lingo_user_id", d.lingo_user_id).maybeSingle();
    if (!before) return { ok: false, message: "Seller not found." };
    const { error } = await db.from("bot_sellers").update({ ai_monthly_budget_usd: d.budget, status: d.status, budget_warned_at: null }).eq("lingo_user_id", d.lingo_user_id);
    if (error) return { ok: false, message: dbMessage(error) };
    await audit(staff, {
      action: "feeder.lingo.seller",
      table: "lingo.bot_sellers",
      recordId: String(d.lingo_user_id),
      summary: `AI allowance US$${d.budget}, status ${d.status}`,
      before: { budget: before.ai_monthly_budget_usd, status: before.status },
      after: { budget: d.budget, status: d.status },
    });
    return done("Saved");
  });
}

const priceInput = z.object({
  model: z.string().trim().regex(/^[a-z0-9.-]{3,60}$/, "Model id, e.g. gemini-3.5-flash-lite"),
  in_per_m: z.coerce.number().min(0).max(1000),
  out_per_m: z.coerce.number().min(0).max(1000),
  audio_in_per_m: z.coerce.number().min(0).max(1000),
  cached_in_per_m: z.coerce.number().min(0).max(1000),
});
/** Gemini prices (US$ per 1M tokens): every AI call's cost is worked out from these. */
export async function saveModelPrice(raw: z.input<typeof priceInput>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = priceInput.parse(raw);
    const { error } = await lingo().from("model_prices").upsert({ ...d, updated_at: new Date().toISOString() }, { onConflict: "model" });
    if (error) return { ok: false, message: dbMessage(error) };
    await audit(staff, { action: "feeder.lingo.model_price", table: "lingo.model_prices", recordId: d.model, summary: `${d.model}: in ${d.in_per_m} / out ${d.out_per_m} / audio ${d.audio_in_per_m} / cached ${d.cached_in_per_m}`, after: d });
    return done("Price saved");
  });
}

const optText = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const contentInput = z.object({
  product_id_feeder: z.coerce.number().int().positive(),
  short_description: optText(300),
  long_description: optText(4000),
  ingredients: optText(2000),
  application: optText(2000),
  precautions: optText(2000),
  symptoms: optText(1000),
  aliases: optText(1000),
  picture_url: z.string().trim().max(500).refine((v) => !v || /^https:\/\/\S+$/.test(v), "Use a public https:// link").transform((v) => v || null),
});
/** Shared Lingo content for a Feeder product (sellers' own text still wins). */
export async function saveSharedContent(raw: z.input<typeof contentInput>): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = contentInput.parse(raw);
    const { error } = await lingo().from("product_content").upsert({ ...d, updated_by: staff.user.id }, { onConflict: "product_id_feeder" });
    if (error) return { ok: false, message: dbMessage(error) };
    await audit(staff, { action: "feeder.lingo.shared_content", table: "lingo.product_content", recordId: String(d.product_id_feeder), summary: `Shared Lingo content for Feeder product ${d.product_id_feeder}` });
    return done("Shared content saved. Answers for this product refresh automatically.");
  });
}
