"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, dbMessage, run, type ActionResult } from "@/lib/action";
import { getFeeder } from "@/lib/feeder/access";
import { feederDb } from "@/lib/feeder/db";
import { lfDb } from "@/lib/feeder/lingo-feeder/db";
import { USES, ownsAny } from "@/lib/feeder/shared";

const text = (max: number) => z.string().trim().max(max, `Up to ${max} characters`);
const optText = (max: number) => text(max).transform((v) => v || null);

const businessInput = z.object({
  business_name: text(80).min(2, "Enter your shop's name"),
  phone: optText(40).refine((v) => !v || /^(\+?94|0)\d{9}$/.test(v.replace(/[^\d+]/g, "")), "Enter a Sri Lankan phone number (07X XXX XXXX)"),
  location: optText(120),
  address: optText(300),
  delivery_days: z.string().trim().regex(/^\d{1,2}(-\d{1,2})?$/, 'Days like "3" or "2-3"'),
  call_hours: text(40).min(2, 'When you call customers back, e.g. "9am - 6pm"'),
  about: optText(300),
  /** Lingo Feeder only: answer only people who came from an ad. */
  ads_only: z.boolean().optional(),
});

/** One set of business details for every Feeder tool (Lingo Feeder's copy follows in the database). */
export async function saveBusinessDetails(input: z.input<typeof businessInput>): Promise<ActionResult> {
  return run(async () => {
    const feeder = await getFeeder();
    if (!feeder) throw new AccessError("Please sign in again.");
    const { ads_only, ...d } = businessInput.parse(input);
    const { error } = await feederDb().from("customers").upsert({ user_id: feeder.user.id, ...d, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return { ok: false, message: dbMessage(error) };
    if (typeof ads_only === "boolean" && ownsAny(feeder.packages, USES.whatsapp)) {
      await lfDb().from("sellers").update({ ads_only }).eq("user_id", feeder.user.id);
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved. Lingo Feeder and Auto comment use these details from now on." };
  });
}
