"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { revalidateWebsite } from "@/lib/revalidate";

const key = z.enum(["bank_transfer", "card"]);

/** Change one payment method: its state (active / coming soon / off), wording and bank details. */
export async function savePaymentMethod(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const d = z
      .object({
        key,
        label: z.string().trim().min(2, "Give it a name").max(60),
        description: z.string().trim().max(300).transform((v) => v || null),
        status: z.enum(["active", "coming_soon", "off"]),
        instructions: z.string().trim().max(4000).transform((v) => v || null),
      })
      .parse(input);
    const { data: before } = await staff.supabase.from("payment_methods").select("*").eq("key", d.key).maybeSingle();
    if (before?.is_default && d.status !== "active") {
      return { ok: false, message: "This is the default method. Make another method the default first, then change this one." };
    }
    if (d.key === "bank_transfer" && d.status === "active" && !d.instructions) {
      return { ok: false, message: "Add your bank details first, so customers know where to pay.", fieldErrors: { instructions: "Required" } };
    }
    const { error } = await staff.supabase.from("payment_methods").update({ label: d.label, description: d.description, status: d.status, instructions: d.instructions }).eq("key", d.key);
    if (error) return { ok: false, message: dbMessage(error) };
    await audit(staff, { action: "payment_method.update", table: "payment_methods", recordId: d.key, summary: `${d.label}: ${d.status.replace("_", " ")}`, before, after: d });
    revalidatePath("/settings/payments");
    await revalidateWebsite("payment_methods");
    return { ok: true, message: `${d.label} saved` };
  });
}

/** The method new requests use first (must be active). */
export async function setDefaultPaymentMethod(input: { key: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageSettings");
    const k = key.parse(input.key);
    const { error } = await staff.supabase.rpc("set_default_payment_method", { p_key: k });
    if (error) return { ok: false, message: error.code === "P0001" ? "Switch the method on (Active) before making it the default." : dbMessage(error) };
    await audit(staff, { action: "payment_method.default", table: "payment_methods", recordId: k, summary: `Default payment method: ${k.replace("_", " ")}` });
    revalidatePath("/settings/payments");
    await revalidateWebsite("payment_methods");
    return { ok: true, message: "Default payment method changed" };
  });
}
