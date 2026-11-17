"use server";

import { createAdminClient } from "@retexia/supabase/admin";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbMessage, run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { webUrl } from "@/lib/env";
import { ilike } from "@/lib/list-params";
import { rateLimit } from "@/lib/rate-limit";

const uuid = z.uuid();
const phone = z.string().trim().max(40).refine((v) => v === "" || /^\+?[0-9][0-9\s().-]{6,19}$/.test(v), "Enter a valid phone number");

export type CustomerOption = { id: string; name: string; email: string | null; phone: string | null };

export async function findCustomers(query: string): Promise<CustomerOption[]> {
  const { supabase } = await requireRole("view");
  const q = query.trim();
  if (q.length < 2) return [];
  const { data } = await supabase.from("staff_customers").select("id, full_name, email, phone").ilike("search", ilike(q)).limit(10);
  return (data ?? []).map((c) => ({ id: c.id ?? "", name: c.full_name || c.email || "Customer", email: c.email, phone: c.phone }));
}

export async function updateCustomer(input: {
  id: string;
  full_name: string;
  phone: string;
  whatsapp: string;
  business_name: string;
  marketing_opt_in: boolean;
}): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("manageCustomers");
    const d = z
      .object({ id: uuid, full_name: z.string().trim().min(1).max(120), phone, whatsapp: phone, business_name: z.string().trim().max(200), marketing_opt_in: z.boolean() })
      .parse(input);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: d.full_name, phone: d.phone || null, whatsapp: d.whatsapp || null, business_name: d.business_name || null, marketing_opt_in: d.marketing_opt_in })
      .eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath(`/customers/${d.id}`);
    return { ok: true, message: "Customer saved" };
  });
}

/** Create a customer login and email them an invitation (customers created by the team). */
export async function inviteCustomer(input: { email: string; full_name: string; phone?: string; business_name?: string }): Promise<ActionResult<string>> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    if (!(await rateLimit("invite", 30, 60 * 60 * 1000))) return { ok: false, message: "Too many invitations. Try again later." };
    const d = z
      .object({ email: z.email().toLowerCase(), full_name: z.string().trim().min(1).max(120), phone: phone.optional(), business_name: z.string().trim().max(200).optional() })
      .parse(input);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(d.email, {
      data: { full_name: d.full_name },
      redirectTo: `${webUrl()}/auth/confirm?next=/reset-password`,
    });
    if (error || !data.user) {
      return { ok: false, message: error?.message?.includes("already") ? "Someone with this email already has an account. Search for them instead." : (error?.message ?? "Could not invite.") };
    }
    await admin.from("profiles").update({ phone: d.phone || null, business_name: d.business_name || null, full_name: d.full_name }).eq("id", data.user.id);
    await audit(staff, { action: "auth.invite", table: "profiles", recordId: data.user.id, summary: `Invited customer ${d.email}` });
    revalidatePath("/customers");
    return { ok: true, message: `Invitation sent to ${d.email}`, data: data.user.id };
  });
}

type AccountAction = "reset_link" | "resend_confirmation" | "ban" | "unban";

export async function customerAccountAction(input: { id: string; action: AccountAction }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = z.object({ id: uuid, action: z.enum(["reset_link", "resend_confirmation", "ban", "unban"]) }).parse(input);
    const admin = createAdminClient();
    const { data: target } = await admin.auth.admin.getUserById(d.id);
    const email = target.user?.email;
    if (!email) return { ok: false, message: "This customer has no login email." };
    const { data: profile } = await staff.supabase.from("profiles").select("role").eq("id", d.id).maybeSingle();
    if (profile && profile.role !== "customer" && staff.role !== "owner") return { ok: false, message: "Only an owner can do this to a team member." };

    let summary = "";
    if (d.action === "reset_link") {
      const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${webUrl()}/auth/confirm?next=/reset-password` });
      if (error) return { ok: false, message: error.message };
      summary = `Sent a password reset link to ${email}`;
    } else if (d.action === "resend_confirmation") {
      const { error } = await admin.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${webUrl()}/auth/confirm?next=/account` } });
      if (error) return { ok: false, message: error.message };
      summary = `Resent the confirmation email to ${email}`;
    } else {
      if (d.id === staff.user.id) return { ok: false, message: "You can't ban yourself." };
      const { error } = await admin.auth.admin.updateUserById(d.id, { ban_duration: d.action === "ban" ? "876000h" : "none" });
      if (error) return { ok: false, message: error.message };
      summary = `${d.action === "ban" ? "Banned" : "Unbanned"} ${email}`;
    }
    await audit(staff, { action: `auth.${d.action}`, table: "profiles", recordId: d.id, summary });
    revalidatePath(`/customers/${d.id}`);
    return { ok: true, message: summary };
  });
}

export async function changeCustomerEmail(input: { id: string; email: string }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = z.object({ id: uuid, email: z.email().toLowerCase() }).parse(input);
    const admin = createAdminClient();
    const { data: before } = await admin.auth.admin.getUserById(d.id);
    const { error } = await admin.auth.admin.updateUserById(d.id, { email: d.email, email_confirm: true });
    if (error) return { ok: false, message: error.message.includes("already") ? "That email is used by another account." : error.message };
    await audit(staff, { action: "auth.change_email", table: "profiles", recordId: d.id, summary: `Changed login email ${before.user?.email ?? ""} → ${d.email}`, before: { email: before.user?.email }, after: { email: d.email } });
    revalidatePath(`/customers/${d.id}`);
    return { ok: true, message: "Email changed" };
  });
}

/** Every file under a folder of a storage bucket (folders are listed level by level). */
async function removeFolder(bucket: string, prefix: string): Promise<number> {
  const storage = createAdminClient().storage.from(bucket);
  const files: string[] = [];
  const walk = async (dir: string, depth: number) => {
    if (depth > 4) return;
    const { data } = await storage.list(dir, { limit: 1000 });
    for (const item of data ?? []) {
      const path = `${dir}/${item.name}`;
      if (item.id) files.push(path);
      else await walk(path, depth + 1);
    }
  };
  await walk(prefix, 0);
  for (let i = 0; i < files.length; i += 100) await storage.remove(files.slice(i, i + 100));
  return files.length;
}

/**
 * Owner: delete a customer.
 *   keep (default): remove the login, keep requests and payments for accounting (personal fields anonymised).
 *   everything: also delete their requests, payments, Post business (with its Facebook / Instagram
 *   tokens), messages and uploaded files. Lingo bots are unlinked and switched off.
 */
export async function deleteCustomer(input: { id: string; everything?: boolean }): Promise<ActionResult> {
  return run(async () => {
    const staff = await requireRole("manageTeam");
    const id = uuid.parse(input.id);
    if (id === staff.user.id) return { ok: false, message: "You can't delete yourself." };
    const admin = createAdminClient();

    if (input.everything) {
      const { data, error } = await staff.supabase.rpc("admin_purge_user", { p_user_id: id });
      if (error) return { ok: false, message: dbMessage(error) };
      const purged = (data ?? {}) as { businesses?: string[]; orders?: number; payments?: number };
      const { error: delError } = await admin.auth.admin.deleteUser(id);
      if (delError && !/not found/i.test(delError.message)) {
        return { ok: false, message: `Their data was deleted, but the login could not be: ${delError.message}` };
      }
      // Uploaded files: payment slips (payment-proofs/<user>/…) and Post pictures (media/<business>/…).
      let files = 0;
      try {
        files += await removeFolder("payment-proofs", id);
        for (const b of purged.businesses ?? []) files += await removeFolder("media", b);
      } catch (e) {
        console.error("[delete customer] storage", e);
      }
      await audit(staff, {
        action: "auth.delete",
        table: "profiles",
        recordId: id,
        summary: `Deleted customer completely (${purged.orders ?? 0} request(s), ${purged.payments ?? 0} payment(s), ${files} file(s))`,
      });
      revalidatePath("/customers");
      revalidatePath("/requests", "layout");
      revalidatePath("/payments");
      return { ok: true, message: "Customer deleted with everything they had." };
    }

    const { error } = await staff.supabase.rpc("admin_anonymise_user", { p_user_id: id });
    if (error) return { ok: false, message: dbMessage(error) };
    const { error: delError } = await admin.auth.admin.deleteUser(id);
    if (delError) return { ok: false, message: `Personal data was anonymised, but the login could not be deleted: ${delError.message}` };
    await audit(staff, { action: "auth.delete", table: "profiles", recordId: id, summary: "Deleted customer login (orders and payments kept)" });
    revalidatePath("/customers");
    return { ok: true, message: "Customer deleted. Their orders and payments are kept for accounting." };
  });
}

export async function addCustomerNote(input: { userId: string; body: string; pinned: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { supabase, user } = await requireRole("operate");
    const d = z.object({ userId: uuid, body: z.string().trim().min(1).max(10000), pinned: z.boolean() }).parse(input);
    const { error } = await supabase.from("customer_notes").insert({ user_id: d.userId, author_id: user.id, body: d.body, pinned: d.pinned });
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath(`/customers/${d.userId}`);
    return { ok: true, message: "Note added" };
  });
}

export async function updateCustomerNote(input: { id: string; userId: string; pinned?: boolean; remove?: boolean }): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await requireRole("operate");
    const d = z.object({ id: uuid, userId: uuid, pinned: z.boolean().optional(), remove: z.boolean().optional() }).parse(input);
    const { error } = d.remove
      ? await supabase.from("customer_notes").delete().eq("id", d.id)
      : await supabase.from("customer_notes").update({ pinned: d.pinned ?? false }).eq("id", d.id);
    if (error) return { ok: false, message: dbMessage(error) };
    revalidatePath(`/customers/${d.userId}`);
    return { ok: true, message: d.remove ? "Note deleted" : "Note updated" };
  });
}

const SUPPORT_LINK_MINUTES = 60;
const panelOk = (url: URL) => url.protocol === "https:" ? /(^|\.)retexia\.com$/i.test(url.hostname) : process.env.NODE_ENV !== "production" && url.hostname === "localhost";

/**
 * Support mode: open a customer's product panel as the customer (to change
 * their settings for them). Admins and owners only, with a reason; recorded
 * in the audit log, and (optionally) the customer is told by email. Returns a
 * one-time link (10 minutes) for this team member only; the session lasts
 * an hour or until "End". See supabase/migrations/0034_support_sessions.sql.
 */
export async function startSupportSession(input: { customer_id: string; product: string; reason: string; notify: boolean }): Promise<ActionResult<string>> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    if (!(await rateLimit("support", 20, 60 * 60 * 1000))) return { ok: false, message: "Too many support sessions. Try again later." };
    const d = z
      .object({
        customer_id: uuid,
        product: z.string().regex(/^[a-z0-9-]{1,40}$/),
        reason: z.string().trim().min(3, "Say why you're opening their account").max(300),
        notify: z.boolean(),
      })
      .parse(input);
    if (d.customer_id === staff.user.id) return { ok: false, message: "That's your own account." };
    const admin = createAdminClient();
    const [{ data: c }, { data: p }] = await Promise.all([
      admin.from("profiles").select("id, full_name, email, role").eq("id", d.customer_id).maybeSingle(),
      admin.from("products").select("slug, short_name, panel_url, panel_live").eq("slug", d.product).maybeSingle(),
    ]);
    if (!c) return { ok: false, message: "Customer not found." };
    if (c.role !== "customer") return { ok: false, message: "Support mode is for customers, not team members." };
    if (!p?.panel_url || !p.panel_live) return { ok: false, message: "This product has no live panel yet." };
    let panel: URL;
    try {
      panel = new URL(p.panel_url);
    } catch {
      return { ok: false, message: "This product's panel address is not valid." };
    }
    if (!panelOk(panel)) return { ok: false, message: "This product's panel is not on retexia.com." };

    const token = randomBytes(32).toString("base64url");
    const { error } = await admin.from("support_sessions").insert({
      staff_id: staff.user.id,
      customer_id: c.id,
      reason: d.reason,
      link_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + SUPPORT_LINK_MINUTES * 60_000).toISOString(),
    });
    if (error) return { ok: false, message: dbMessage(error) };
    const name = c.full_name || c.email || "the customer";
    await audit(staff, { action: "support.start", table: "profiles", recordId: c.id, summary: `Support mode for ${name} (${p.short_name}): ${d.reason}` });

    if (d.notify && c.email) {
      const who = staff.profile.full_name || "A member of the Retexia team";
      await admin.from("notifications_outbox").insert({
        event: "support.opened",
        channel: "email",
        recipient: c.email.toLowerCase(),
        user_id: c.id,
        subject: "Retexia support is helping with your account",
        body: `Hi${c.full_name ? ` ${c.full_name.split(" ")[0]}` : ""},\n\n${who} from Retexia opened your ${p.short_name} panel to help you: ${d.reason}\n\nFor the next hour they can make changes in your Retexia panels for you. They can't see or change your password or your payments.\n\nIf you didn't ask for this, just reply to this email.`,
        payload: {},
      });
    }
    return { ok: true, message: "Opening their panel…", data: `${panel.origin}/support/start?token=${token}&next=/` };
  });
}
