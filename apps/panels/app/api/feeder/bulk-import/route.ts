import { NextResponse, type NextRequest } from "next/server";
import { getFeeder } from "@/lib/feeder/access";
import { productsForWorker } from "@/lib/feeder/data";
import { toolFor } from "@/lib/feeder/tools";

/**
 * Feeder → Bulk import (v1 and v2). The signed-in customer's lead files and, for
 * v2, their CRM Google Sheet links go to the n8n worker (FEEDER_N8N_URL, header
 * X-Retexia-Key = FEEDER_N8N_KEY) in one request: fields "facebook", "tiktok"
 * (files), "crm_links" (JSON list) and "products" (JSON: the Feeder products
 * with this customer's form names and prices, from Supabase). Its "Collect sources" step reads the
 * sheets, the same as the n8n form, and the single courier CSV comes straight
 * back as a download. Nothing is stored: files only pass through.
 *
 * Form fields: v1 "files" (Facebook .xls/.csv); v2 "facebook", "tiktok" (files)
 * and "crm" (Google Sheet links).
 */
export const maxDuration = 120;

const MAX_FILES = 30;
const MAX_TOTAL = 4 * 1024 * 1024;
const MAX_SHEETS = 20;
const FACEBOOK = /\.(xls|csv)$/i;
const TIKTOK = /\.(xlsx|csv)$/i;

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, error: string) => json({ ok: false, error }, status);
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();

/** A Google Sheet link (the worker reads it as CSV): docs.google.com/spreadsheets/… only. */
const sheetLink = (link: string) => /^https:\/\/docs\.google\.com\/spreadsheets\/d\/(e\/)?[\w-]{20,}/.test(link);

export async function POST(request: NextRequest) {
  const feeder = await getFeeder();
  if (!feeder) return fail(401, "Please sign in again.");
  const owns = (tool: string) => feeder.packages.some((p) => p.owned && toolFor(p.slug) === tool);
  const hasV2 = owns("bulk-import-v2");

  const url = process.env.FEEDER_N8N_URL?.trim();
  if (!url) return fail(503, "Bulk import is being set up. Please try again later.");

  const form = await request.formData().catch(() => null);
  const files = (name: string) => (form?.getAll(name) ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  const v1 = files("files");
  const facebook = files("facebook");
  const tiktok = files("tiktok");
  const links = [...new Set((form?.getAll("crm") ?? []).map((l) => String(l).trim()).filter(Boolean))];

  // TikTok files and CRM sheets are Bulk import v2.
  const v2Request = facebook.length > 0 || tiktok.length > 0 || links.length > 0;
  if (v2Request ? !hasV2 : !(owns("bulk-import") || hasV2)) return fail(403, v2Request ? "TikTok files and CRM sheets are part of Bulk import v2." : "Bulk import isn't part of your packages.");

  const fb = [...v1, ...facebook];
  const all = [...fb, ...tiktok];
  if (!all.length && !links.length) return fail(400, "Add at least one lead file or CRM sheet link.");
  if (all.length > MAX_FILES) return fail(400, `Up to ${MAX_FILES} files at a time.`);
  if (links.length > MAX_SHEETS) return fail(400, `Up to ${MAX_SHEETS} CRM sheets at a time.`);
  if (fb.some((f) => !FACEBOOK.test(f.name))) return fail(400, "Facebook lead files must be .xls or .csv, as downloaded.");
  if (tiktok.some((f) => !TIKTOK.test(f.name))) return fail(400, "TikTok lead files must be .xlsx or .csv, as downloaded.");
  if (all.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) return fail(413, "These files are over 4 MB together. Build the CSV in two goes.");

  const bad = links.map((l, i) => (sheetLink(l) ? null : `CRM sheet ${i + 1}: this isn't a Google Sheet link (docs.google.com/spreadsheets/…).`)).filter((p): p is string => Boolean(p));
  if (bad.length) return json({ ok: false, problems: bad }, 422);

  const out = new FormData();
  for (const f of fb) out.append("facebook", f, f.name);
  for (const f of tiktok) out.append("tiktok", f, f.name);
  if (links.length) out.append("crm_links", JSON.stringify(links));
  // The customer's products (Supabase "feeder"): every Feeder product with their form names and prices.
  // Without it (schema not exposed yet) the worker falls back to its Products Google Sheet.
  const products = await productsForWorker(feeder.user.id).catch((e) => {
    console.error("[feeder] products", e);
    return null;
  });
  if (products?.length) out.append("products", JSON.stringify(products));

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-retexia-key": process.env.FEEDER_N8N_KEY?.trim() ?? "" },
      body: out,
      signal: AbortSignal.timeout(110_000),
      cache: "no-store",
    });
  } catch (e) {
    return fail(504, e instanceof Error && e.name === "TimeoutError" ? "Building the file took too long. Try fewer files or sheets at a time." : "The Feeder worker didn't answer. Please try again in a minute.");
  }

  const type = res.headers.get("content-type") ?? "";
  if (res.ok && !type.includes("json")) {
    const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "orders.csv";
    return new NextResponse(res.body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
        "x-feeder-orders": res.headers.get("x-feeder-orders") ?? "",
        "x-feeder-summary": res.headers.get("x-feeder-summary") ?? "",
        "cache-control": "no-store",
      },
    });
  }
  const answer = (await res.json().catch(() => null)) as { ok?: boolean; problems?: unknown } | null;
  if (answer && Array.isArray(answer.problems) && answer.problems.length) {
    return json({ ok: false, problems: answer.problems.map((p) => plain(String(p))).filter(Boolean) }, 422);
  }
  if (res.status === 404) return fail(502, "Bulk import is being set up (the worker isn't switched on). Please try again later.");
  return fail(502, `The Feeder worker couldn't build the file (${res.status}). Please try again.`);
}
