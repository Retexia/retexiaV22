"use server";

import { STAFF_ROLES } from "@retexia/supabase";
import { createAdminClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { adminUrl } from "@/lib/env";

const roles = z.enum(["customer", ...STAFF_ROLES]);

/** Owner: change anyone's role (the database refuses to remove the last owner). */
export async function setStaffRole(input: { userId: string; role: string }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageTeam");
    const d = z.object({ userId: z.uuid(), role: roles }).parse(input);
    const { error } = await supabase.from("profiles").update({ role: d.role }).eq("id", d.userId);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath("/settings/team");
    revalidatePath(`/customers/${d.userId}`);
    return { ok: true, message: d.role === "customer" ? "Removed from the team" : "Role changed" };
  });
}

/** Owner: invite a team member by email with a role. They set a password, then MFA. */
export async function inviteStaff(input: { email: string; full_name: string; role: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageTeam");
    const d = z.object({ email: z.email().toLowerCase(), full_name: z.string().trim().min(1).max(120), role: z.enum(STAFF_ROLES) }).parse(input);
    const admin = createAdminClient();
    const existing = await staff.supabase.from("profiles").select("id, role").eq("email", d.email).maybeSingle();
    let userId = existing.data?.id;
    if (!userId) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(d.email, {
        data: { full_name: d.full_name },
        redirectTo: `${adminUrl()}/auth/confirm?next=/reset-password?invited=1`,
      });
      if (error || !data.user) return { ok: false, message: error?.message ?? "Could not send the invitation." };
      userId = data.user.id;
    }
    const { error } = await admin.from("profiles").update({ role: d.role, full_name: d.full_name }).eq("id", userId);
    if (error) return { ok: false, message: dbMessage(error) };
    await audit(staff, { action: "staff.invited", table: "profiles", recordId: userId, summary: `${existing.data ? "Gave" : "Invited"} ${d.email} the ${d.role} role` });
    await admin.from("notifications_outbox").insert({
      event: "staff.invited",
      channel: "email",
      recipient: d.email,
      user_id: userId,
      subject: "You were added to the Retexia admin",
      body: `You now have the ${d.role} role on ${adminUrl()}. Sign in, then set up two-step sign-in.`,
      payload: { role: d.role },
    });
    revalidatePath("/settings/team");
    return { ok: true, message: existing.data ? `${d.email} already had an account and is now ${d.role}` : `Invitation sent to ${d.email}` };
  });
}

/** Owner: remove a team member's authenticators (lost phone). They set one up again at next sign-in. */
export async function resetStaffMfa(input: { userId: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageTeam");
    const userId = z.uuid().parse(input.userId);
    if (userId === staff.user.id) return { ok: false, message: "Use Your account to change your own authenticators." };
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
    if (error) return { ok: false, message: error.message };
    for (const f of data?.factors ?? []) {
      const { error: e } = await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
      if (e) return { ok: false, message: e.message };
    }
    await audit(staff, { action: "auth.mfa_reset", table: "profiles", recordId: userId, summary: `Reset two-step sign-in (${data?.factors.length ?? 0} authenticator(s) removed)` });
    revalidatePath("/settings/team");
    return { ok: true, message: "Two-step sign-in reset. They set it up again when they next sign in." };
  });
}
