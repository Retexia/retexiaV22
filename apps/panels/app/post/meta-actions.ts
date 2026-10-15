"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { requireBusiness } from "@/lib/post/session";

const uuid = z.uuid();

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
