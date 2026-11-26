import { z } from "zod";
import { appRoute, body, json } from "@/lib/app/http";

/**
 * "Delete my account" (required by Google Play and Apple). POST asks the Retexia team to delete
 * the account and everything in it; DELETE cancels the request while it's still open.
 */
export const GET = appRoute(async (_request, user) => {
  const { data } = await user.sb.from("account_deletion_requests").select("created_at").eq("user_id", user.id).eq("status", "pending").maybeSingle();
  return { requestedAt: data?.created_at ?? null };
});

export const POST = appRoute(async (request, user) => {
  const d = z.object({ reason: z.string().trim().max(1000).optional().nullable() }).parse(await body(request));
  const { data, error } = await user.sb.rpc("request_account_deletion", { p_reason: d.reason ?? undefined, p_source: "app" });
  if (error) throw new Error(`request_account_deletion: ${error.message}`);
  const r = data as { created_at: string; new: boolean };
  return json({ message: "We got your request. The Retexia team will delete your account and everything in it, and email you when it's done.", data: { requestedAt: r.created_at } });
});

export const DELETE = appRoute(async (_request, user) => {
  const { error } = await user.sb.rpc("cancel_account_deletion");
  if (error) throw new Error(`cancel_account_deletion: ${error.message}`);
  return json({ message: "Your account stays. The deletion request is cancelled." });
});
