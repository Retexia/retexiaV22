import { NextResponse, type NextRequest } from "next/server";
import { getFeeder } from "@/lib/feeder/access";
import { toolFor } from "@/lib/feeder/tools";

/**
 * Feeder → Bulk import (v1 and v2). The signed-in customer's lead files, and for
 * v2 their CRM Google Sheets (read here from the view links as CSV), go to the
 * n8n worker (FEEDER_N8N_URL, header X-Retexia-Key = FEEDER_N8N_KEY) in one
 * request, and its single courier CSV comes straight back as a download.
 * Nothing is stored: files and sheets only pass through.
 *
 * Form fields: v1 "files" (Facebook .xls/.csv); v2 "facebook", "tiktok" (files)
 * and "crm" (Google Sheet links).
 */
export const maxDuration = 120;

const MAX_FILES = 30;
const MAX_TOTAL = 4 * 1024 * 1024;
const MAX_SHEETS = 20;
const MAX_SHEET_BYTES = 10 * 1024 * 1024;
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

/** A Google Sheet link (normal or "publish to web") → its CSV export address, on docs.google.com only. */
function exportUrl(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const gid = /[#&?]gid=(\d+)/.exec(link)?.[1] ?? "0";
  const published = /^\/spreadsheets\/d\/e\/([\w-]+)/.exec(url.pathname);
  if (published) return `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv&gid=${gid}`;
  const id = /^\/spreadsheets\/d\/([\w-]{20,})/.exec(url.pathname)?.[1];
  return id ? `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}` : null;
}

/** Reads one CRM sheet as CSV, named after the sheet ("Title - Tab.csv") when Google says. */
async function readSheet(link: string, n: number): Promise<{ file: File } | { problem: string }> {
  const label = `CRM sheet ${n}`;
  const url = exportUrl(link);
  if (!url) return { problem: `${label}: this isn't a Google Sheet link (docs.google.com/spreadsheets/…).` };
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(25_000), cache: "no-store" });
  } catch {
    return { problem: `${label}: Google didn't answer. Try again in a minute.` };
  }
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !/text\/csv|text\/plain|application\/octet-stream/.test(type)) {
    return { problem: `${label}: Retexia can't open it. In the sheet, Share → General access → "Anyone with the link" → Viewer, then try again.` };
  }
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_SHEET_BYTES) return { problem: `${label}: the tab is over 10 MB. Use a tab with only the orders to send.` };
  if (!body.byteLength) return { problem: `${label}: the tab is empty. Copy the link while the orders tab is open (it ends with #gid=…).` };
  const disposition = res.headers.get("content-disposition") ?? "";
  const named = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ?? /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  let name = label;
  try {
    if (named) name = decodeURIComponent(named).replace(/\.csv$/i, "");
  } catch {
    // keep the plain label
  }
  return { file: new File([body], `CRM - ${name.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 100)}.csv`, { type: "text/csv" }) };
}

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

  // CRM sheets, read now (in parallel); any sheet that can't be read stops the build with the reason.
  const sheets = await Promise.all(links.map((l, i) => readSheet(l, i + 1)));
  const sheetProblems = sheets.flatMap((s) => ("problem" in s ? [s.problem] : []));
  if (sheetProblems.length) return json({ ok: false, problems: sheetProblems }, 422);

  const out = new FormData();
  for (const f of all) out.append("files", f, f.name);
  for (const s of sheets) if ("file" in s) out.append("files", s.file, s.file.name);

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
