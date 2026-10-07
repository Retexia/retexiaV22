import { NextResponse, type NextRequest } from "next/server";
import { postDb } from "@/lib/post/post-db";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Status page for a Meta data deletion request (linked from Facebook). */
export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") ?? "").slice(0, 40);
  const valid = /^[0-9a-f]{16}$/.test(code);
  const { data } = valid ? await postDb().from("events").select("created_at").eq("type", "data_deletion").eq("payload->>confirmation_code", code).maybeSingle() : { data: null };
  const body = data
    ? `<h1>Your data was deleted</h1><p>Confirmation code <code>${esc(code)}</code>. On ${esc(new Date(data.created_at).toUTCString())} Retexia deleted the Facebook and Instagram connections and access tokens linked to your Facebook account.</p>`
    : `<h1>Request not found</h1><p>Check the confirmation code, or email hello@retexia.com.</p>`;
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Data deletion · Retexia</title><style>body{font-family:system-ui,sans-serif;max-width:560px;margin:10vh auto;padding:16px;line-height:1.6;color:#16264a}</style></head><body>${body}</body></html>`,
    { status: data ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
