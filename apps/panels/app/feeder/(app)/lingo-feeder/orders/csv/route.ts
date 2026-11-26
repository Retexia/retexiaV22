import { NextResponse, type NextRequest } from "next/server";
import { allOrdersCsv, courierCsv, csvResponse } from "@/lib/feeder/lingo-feeder/csv";
import { lingoFeederActor } from "@/lib/feeder/lingo-feeder/data";

/**
 * Lingo Feeder orders as CSV (see lib/feeder/lingo-feeder/csv.ts; the app shares the same file).
 *   ?kind=courier  the next courier file for Feeder Bulk create, then marked as downloaded
 *   ?kind=all      every order (records)
 */
export async function GET(request: NextRequest) {
  const a = await lingoFeederActor();
  if (!a) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const file = request.nextUrl.searchParams.get("kind") === "all" ? await allOrdersCsv(a.userId) : await courierCsv(a.userId);
  if (!file.ok) return NextResponse.json({ ok: false, error: file.error }, { status: file.status });
  return csvResponse(file);
}
