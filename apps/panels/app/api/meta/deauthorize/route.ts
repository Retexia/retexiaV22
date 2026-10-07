import { NextResponse, type NextRequest } from "next/server";
import { parseSignedRequest } from "@/lib/post/meta";
import { postDb } from "@/lib/post/post-db";

/** Meta "Deauthorize callback": the person removed Retexia from Facebook. Stop posting for them. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const data = parseSignedRequest(String(form?.get("signed_request") ?? ""));
  if (!data?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const db = postDb();
  const { data: rows } = await db.from("social_accounts").update({ status: "disconnected", enabled: false }).eq("meta_user_id", data.user_id).select("business_id, platform");
  for (const r of rows ?? []) await db.from("events").insert({ business_id: r.business_id, type: "meta_deauthorized", payload: { platform: r.platform } });
  return NextResponse.json({ ok: true });
}
