"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run, dbMessage, type ActionResult } from "@/lib/action";
import { requireRole } from "@/lib/auth";

export async function saveView(input: { page: string; name: string; query: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user } = await requireRole("view");
    const d = z.object({ page: z.string().min(1).max(100), name: z.string().trim().min(1).max(80), query: z.string().max(2000) }).parse(input);
    const { error } = await supabase.from("admin_saved_views").insert({ user_id: user.id, page: d.page, name: d.name, filters: { query: d.query } });
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath(d.page);
    return { ok: true, message: "View saved" };
  });
}

export async function deleteView(id: string, page: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("view");
    const { error } = await supabase.from("admin_saved_views").delete().eq("id", z.uuid().parse(id));
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath(page);
    return { ok: true, message: "View removed" };
  });
}
