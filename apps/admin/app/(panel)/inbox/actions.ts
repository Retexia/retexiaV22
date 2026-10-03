"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { requireRole } from "@/lib/auth";

export async function setMessageStatus(input: { id: string; status: "new" | "read" | "replied" | "archived" }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("operate");
    const d = z.object({ id: z.uuid(), status: z.enum(["new", "read", "replied", "archived"]) }).parse(input);
    const { error } = await supabase.from("contact_messages").update({ status: d.status }).eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/inbox");
    revalidatePath("/", "layout");
    return { ok: true, message: `Marked as ${d.status}` };
  });
}

export async function deleteMessage(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const { error } = await supabase.from("contact_messages").delete().eq("id", z.uuid().parse(input.id));
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/inbox");
    return { ok: true, message: "Message deleted" };
  });
}

export async function removeFromWaitlist(input: { id: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageSettings");
    const { error } = await supabase.from("waitlist").delete().eq("id", z.uuid().parse(input.id));
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/inbox");
    return { ok: true, message: "Removed from the waitlist" };
  });
}
