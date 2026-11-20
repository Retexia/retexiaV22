import { NextResponse, type NextRequest } from "next/server";
import { lingoActor } from "@/lib/feeder/lingo/data";
import { botDb } from "@/lib/feeder/lingo/db";

/**
 * Lingo orders as CSV.
 *   ?kind=courier  confirmed orders not in a courier file yet, in Bulk create's courier format
 *                  (name,address,tp_1,tp_2,price,qty,item_code,delivery · UTF-8 BOM · CRLF ·
 *                  yyyy_MM_dd(orders).csv), then marked as sent to Feeder
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
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";

export async function GET(request: NextRequest) {
  const a = await lingoActor();
  if (!a) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const kind = request.nextUrl.searchParams.get("kind") === "all" ? "all" : "courier";
  const db = botDb();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, "_");

  if (kind === "all") {
    const { data, error } = await db.from("bot_orders").select("*").eq("lingo_user_id", a.id).eq("test", false).order("created_at", { ascending: false }).limit(5000);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const head = ["order", "date", "status", "delivery", "in_courier_file", "product", "item_code", "qty", "unit_price", "delivery_fee", "total", "name", "address", "phone", "whatsapp", "ad_id"];
    const body = (data ?? []).map((o) => [o.id, o.created_at, o.status, o.delivery_status ?? "", o.feeder_sync === "done" ? "yes" : "no", o.product_name, o.product_id_feeder, o.qty, o.unit_price, o.delivery_fee, o.total, o.name, o.address, o.contact, local(o.phone), o.ad_id ?? ""]);
    return new NextResponse(csv([head, ...body]), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="lingo_orders_${today}.csv"`, "cache-control": "no-store" },
    });
  }

  const { data, error } = await db
    .from("bot_orders")
    .select("id, phone, name, address, contact, unit_price, qty, product_id_feeder, delivery_fee")
    .eq("lingo_user_id", a.id)
    .eq("test", false)
    .eq("status", "confirmed")
    .eq("feeder_sync", "pending")
    .order("confirmed_at")
    .limit(2000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const list = data ?? [];
  if (!list.length) return NextResponse.json({ ok: false, error: "No new confirmed orders." }, { status: 404 });
  const rows = list.map((o) => {
    const tp1 = local(o.contact) || local(o.phone);
    return [String(o.name ?? "").trim(), String(o.address ?? "").replace(/\s*[\r\n]+\s*/g, ", ").trim(), tp1, local(o.phone) || tp1, Number(o.unit_price ?? 0), o.qty, o.product_id_feeder ?? "", Number(o.delivery_fee ?? 0)];
  });
  const { error: e2 } = await db.from("bot_orders").update({ feeder_sync: "done", exported_at: new Date().toISOString() }).eq("lingo_user_id", a.id).in("id", list.map((o) => o.id));
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
  await db.from("bot_events").insert({ lingo_user_id: a.id, type: "courier_file", detail: { orders: list.length } });
  return new NextResponse(csv([["name", "address", "tp_1", "tp_2", "price", "qty", "item_code", "delivery"], ...rows]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${today}(${list.length}).csv"`,
      "x-lingo-orders": String(list.length),
      "cache-control": "no-store",
    },
  });
}
