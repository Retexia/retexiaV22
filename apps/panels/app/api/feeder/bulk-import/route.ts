import { NextResponse, type NextRequest } from "next/server";
import { getFeeder } from "@/lib/feeder/access";
import { toolFor } from "@/lib/feeder/tools";

/**
 * Feeder → Bulk import: the signed-in customer's lead files go to the n8n
 * worker (FEEDER_N8N_URL, header X-Retexia-Key = FEEDER_N8N_KEY) and its
 * courier CSV comes straight back as a download. Only customers who bought a
 * Bulk import package. Nothing is stored: the files only pass through.
 */
export const maxDuration = 60;

const MAX_FILES = 30;
const MAX_TOTAL = 4 * 1024 * 1024;
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();

export async function POST(request: NextRequest) {
  const feeder = await getFeeder();
  if (!feeder) return fail(401, "Please sign in again.");
  if (!feeder.packages.some((p) => p.owned && toolFor(p.slug) === "bulk-import")) return fail(403, "Bulk import isn't part of your packages.");

  const url = process.env.FEEDER_N8N_URL?.trim();
  if (!url) return fail(503, "Bulk import is being set up. Please try again later.");

  const form = await request.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail(400, "Add at least one lead file.");
  if (files.length > MAX_FILES) return fail(400, `Up to ${MAX_FILES} files at a time.`);
  if (files.some((f) => !/\.(xls|csv)$/i.test(f.name))) return fail(400, "Only .xls or .csv lead files from Facebook.");
  if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) return fail(413, "These files are over 4 MB together. Build the CSV in two goes.");

  const out = new FormData();
  for (const f of files) out.append("files", f, f.name);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-retexia-key": process.env.FEEDER_N8N_KEY?.trim() ?? "" },
      body: out,
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });
  } catch (e) {
    return fail(504, e instanceof Error && e.name === "TimeoutError" ? "Building the file took too long. Try fewer files at a time." : "The Feeder worker didn't answer. Please try again in a minute.");
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
  const json = (await res.json().catch(() => null)) as { ok?: boolean; problems?: unknown } | null;
  if (json && Array.isArray(json.problems) && json.problems.length) {
    return NextResponse.json({ ok: false, problems: json.problems.map((p) => plain(String(p))).filter(Boolean) }, { status: 422, headers: { "cache-control": "no-store" } });
  }
  if (res.status === 404) return fail(502, "Bulk import is being set up (the worker isn't switched on). Please try again later.");
  return fail(502, `The Feeder worker couldn't build the file (${res.status}). Please try again.`);
}
