import { NextResponse, type NextRequest } from "next/server";
import { lingoFeederActor } from "@/lib/feeder/lingo-feeder/data";
import { lfDb } from "@/lib/feeder/lingo-feeder/db";

/**
 * Lingo Feeder orders as CSV.
 *   ?kind=courier  confirmed orders not in a courier file yet, in Feeder Bulk create's courier format
 *                  (name,address,tp_1,tp_2,price,qty,item_code,delivery · UTF-8 BOM · CRLF ·
 *                  yyyy_MM_dd(orders).csv), then marked as downloaded
 *   ?kind=all      every order (records)
 */
const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const local = (p: string | null | undefined) => {
  const d = String(p ?? "").replace(/\D/g, "");
  if (/^94\d{9}$/.test(d)) return `0${d.slice(2)}`;
  if (/^\d{9}$/.test(d)) return `0${d}`;
  return d;
};
const csv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";

export async function GET(request: NextRequest) {
  const a = await lingoFeederActor();
  if (!a) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const kind = request.nextUrl.searchParams.get("kind") === "all" ? "all" : "courier";
  const db = lfDb();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, "_");

  if (kind === "all") {
    const { data, error } = await db.from("orders").select("*").eq("user_id", a.userId).eq("test", false).neq("status", "draft").order("created_at", { ascending: false }).limit(5000);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const head = ["order", "date", "status", "in_courier_file", "product", "item_code", "qty", "unit_price", "delivery_fee", "total", "name", "address", "phone", "phone_2", "whatsapp", "ad_id"];
    const body = (data ?? []).map((o) => [o.id, o.confirmed_at ?? o.created_at, o.status, o.exported_at ? "yes" : "no", o.product_name, o.product_id, o.qty, o.unit_price, o.delivery_fee, o.total, o.name, o.address, o.phone1, o.phone2, local(o.phone), o.ad_id ?? ""]);
    return new NextResponse(csv([head, ...body]), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="lingo_feeder_orders_${today}.csv"`, "cache-control": "no-store" },
    });
  }

  const { data, error } = await db
    .from("orders")
    .select("id, phone, name, address, phone1, phone2, unit_price, qty, product_id, delivery_fee")
    .eq("user_id", a.userId).eq("test", false).eq("status", "confirmed").is("exported_at", null)
    .order("confirmed_at").limit(2000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const list = data ?? [];
  if (!list.length) return NextResponse.json({ ok: false, error: "No new confirmed orders." }, { status: 404 });
  const rows = list.map((o) => {
    const tp1 = local(o.phone1) || local(o.phone);
    const tp2 = local(o.phone2) || (local(o.phone) !== tp1 ? local(o.phone) : tp1);
    return [String(o.name ?? "").trim(), String(o.address ?? "").replace(/\s*[\r\n]+\s*/g, ", ").trim(), tp1, tp2, Number(o.unit_price ?? 0), o.qty, o.product_id ?? "", Number(o.delivery_fee ?? 0)];
  });
  const { error: e2 } = await db.from("orders").update({ exported_at: new Date().toISOString() }).eq("user_id", a.userId).in("id", list.map((o) => o.id));
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
  await db.from("events").insert({ user_id: a.userId, type: "courier_file", detail: { orders: list.length } });
  return new NextResponse(csv([["name", "address", "tp_1", "tp_2", "price", "qty", "item_code", "delivery"], ...rows]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${today}(${list.length}).csv"`,
      "x-lingo-orders": String(list.length),
      "cache-control": "no-store",
    },
  });
}
