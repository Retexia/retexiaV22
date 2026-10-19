"use server";

import { createAdminSchemaClient } from "@retexia/supabase/admin";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { run, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { LOGIN_COOKIE, listPages, metaUserId, readLogin } from "@/lib/meta";
import { pageOwners } from "./data";

const post = () => createAdminSchemaClient("post");

/**
 * Saves the Pages the staff member ticked (and their Instagram) for this
 * customer's business: Page tokens go to Vault through post.admin_connect_page(),
 * exactly as when the customer connects them on post.retexia.com.
 */
export async function connectMetaPages(input: { businessId: string; pageIds: string[] }): Promise<ActionResult<{ to: string }>> {
  return run(async () => {
    const staff = await requireRole("manageCustomers");
    const d = z.object({ businessId: z.uuid(), pageIds: z.array(z.string().regex(/^\d{1,30}$/)).min(1, "Tick this customer's Page").max(20) }).parse(input);
    const login = await readLogin(staff.user.id, d.businessId);
    if (!login) return { ok: false, message: "The Facebook login expired (15 minutes). Press “Log in with Facebook” again." };

    const db = post();
    const { data: business } = await db.from("businesses").select("id, name, owner_id").eq("id", d.businessId).maybeSingle();
    if (!business) return { ok: false, message: "This Post business no longer exists." };

    const pages = await listPages(login.token);
    if (!pages.ok) return { ok: false, message: pages.error };
    const chosen = pages.data.filter((p) => d.pageIds.includes(p.id));
    if (chosen.length !== new Set(d.pageIds).size) return { ok: false, message: "A ticked Page is no longer in this Facebook login. Reload the page." };

    // The right customer: a Page (or its Instagram) already on another business is never moved silently.
    const owners = await pageOwners(chosen.flatMap((p) => [p.id, p.instagram?.id].filter((x): x is string => Boolean(x))));
    const taken = chosen.find((p) => [p.id, p.instagram?.id].some((x) => x && owners.get(x) && owners.get(x)!.id !== business.id));
    if (taken) {
      const other = owners.get(taken.id) ?? owners.get(taken.instagram!.id)!;
      return { ok: false, message: `${taken.name} is connected to another customer (${other.name}). Disconnect it there first.` };
    }

    for (const p of chosen) {
      const { error } = await db.rpc("admin_connect_page", {
        p_business: business.id,
        p_page_id: p.id,
        p_token: p.access_token,
        p_instagram_id: p.instagram?.id ?? null,
        p_page_name: p.name,
        p_instagram_name: p.instagram?.username ?? null,
      });
      if (error) return { ok: false, message: `Couldn't save ${p.name}: ${error.message}` };
    }
    const ids = chosen.flatMap((p) => [p.id, p.instagram?.id].filter((x): x is string => Boolean(x)));
    const metaUser = await metaUserId(login.token);
    if (metaUser) await db.from("social_accounts").update({ meta_user_id: metaUser }).eq("business_id", business.id).in("external_id", ids);
    const { data: off } = await db.rpc("enforce_account_limit", { p_business: business.id });
    const turnedOff = Number(off ?? 0);

    const names = chosen.map((p) => `${p.name}${p.instagram ? ` + Instagram @${p.instagram.username ?? p.instagram.id}` : ""}`);
    await db.from("events").insert({
      business_id: business.id,
      type: "accounts_connected",
      payload: { pages: chosen.map((p) => ({ page: p.name, instagram: p.instagram?.username ?? null })), turned_off: turnedOff, by: "retexia" },
    });
    await audit(staff, {
      action: "post.connect_accounts",
      table: "post.social_accounts",
      recordId: business.owner_id,
      summary: `Connected ${names.join(", ")} to the Retexia Post business ${business.name}`,
      after: { business_id: business.id, pages: chosen.map((p) => ({ id: p.id, name: p.name, instagram: p.instagram?.username ?? null })) },
    });

    (await cookies()).delete(LOGIN_COOKIE);
    revalidatePath(`/products/post/businesses/${business.id}`);
    revalidatePath(`/customers/${business.owner_id}`);
    revalidatePath("/products/post");
    const to = login.from === "customer" ? `/customers/${business.owner_id}` : `/products/post/businesses/${business.id}`;
    return {
      ok: true,
      message: `Connected to ${business.name}: ${names.join(", ")}${turnedOff ? `. ${turnedOff} older account(s) switched off (plan limit).` : ""}`,
      data: { to },
    };
  });
}

/** Forgets the Facebook login without saving anything. */
export async function forgetMetaLogin(): Promise<ActionResult> {
  return run(async () => {
    await requireRole("manageCustomers");
    (await cookies()).delete(LOGIN_COOKIE);
    return { ok: true };
  });
}
