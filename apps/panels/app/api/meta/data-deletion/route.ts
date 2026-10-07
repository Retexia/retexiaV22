import { NextResponse, type NextRequest } from "next/server";
import { parseSignedRequest } from "@/lib/post/meta";
import { postDb } from "@/lib/post/post-db";

/**
 * Meta "Data deletion request callback": deletes the person's connected
 * accounts and their tokens, and returns a status link and confirmation code.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const data = parseSignedRequest(String(form?.get("signed_request") ?? ""));
  if (!data?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const { data: code, error } = await postDb().rpc("handle_meta_deletion", { p_meta_user_id: data.user_id });
  if (error || !code) return NextResponse.json({ error: "deletion failed" }, { status: 500 });
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "post.retexia.com";
  return NextResponse.json({ url: `https://${host}/api/meta/deletion-status?code=${encodeURIComponent(code)}`, confirmation_code: code });
}
