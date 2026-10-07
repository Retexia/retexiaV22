import { createServerClient } from "@retexia/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { getCustomer } from "@/lib/customer";
import { webUrl } from "@/lib/env";
import { projectRef } from "@/lib/handoff";
import { lingoDb } from "@/lib/lingo/db";
import { panelForHost } from "@/lib/panel";
import { postDb } from "@/lib/post/post-db";

/**
 * Setup check for the Retexia team: which panel and Supabase project this
 * deployment uses (no secrets). With ?me=1 it also shows what this panel sees
 * for the visitor: session cookies, sign-in, their order and their account.
 */
export async function GET(request: NextRequest) {
  const panel = panelForHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  const body: Record<string, unknown> = {
    panel,
    supabase_project: projectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anon_key_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    service_role_key_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    web_url: webUrl(),
  };
  if (request.nextUrl.searchParams.get("me") === "1") {
    const names = (request.headers.get("cookie") ?? "").split(";").map((c) => c.split("=")[0]!.trim()).filter((n) => n.startsWith("sb-"));
    body.session_cookies = names;
    body.duplicate_session_cookies = names.length !== new Set(names).size;
    const { data } = await (await createServerClient()).auth.getUser();
    body.signed_in = Boolean(data.user);
    if (data.user) {
      const slug = panel === "lingo" ? process.env.LINGO_PRODUCT_SLUG || "lingo" : process.env.POST_PRODUCT_SLUG || "post";
      const customer = await getCustomer(slug);
      body.order = customer?.order ? { ref: customer.order.ref, status: customer.order.status } : "none with status setting_up / active / paused";
      if (panel === "lingo") {
        const { data: own, error } = await lingoDb().from("lingo_users").select("id, active").eq("owner_id", data.user.id);
        body.lingo_bot = error ? `error: ${error.message}` : own?.length ? own : "not connected (Admin → request → Setup → Lingo bot account)";
      } else {
        const { data: own, error } = await postDb().from("businesses").select("id, onboarding_done").eq("owner_id", data.user.id);
        body.post_business = error ? `error: ${error.message}` : own?.length ? own : "none yet (set up at /welcome)";
      }
    }
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
