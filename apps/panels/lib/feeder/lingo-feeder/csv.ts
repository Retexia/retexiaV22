import "server-only";

import { lfDb } from "./db";

/**
 * Lingo Feeder orders as CSV, shared by the web panel (/lingo-feeder/orders/csv) and the app
 * (/api/app/lingo-feeder/orders/courier.csv).
 *   courier  confirmed orders not in a courier file yet, in Feeder Bulk create's courier format
 *            (name,address,tp_1,tp_2,price,qty,item_code,delivery · UTF-8 BOM · CRLF ·
 *            yyyy_MM_dd(orders).csv), then marked as downloaded
 *   all      every order (records)
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
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, "_");

export type CsvFile = { ok: true; body: string; filename: string; count: number } | { ok: false; status: number; error: string };

export async function allOrdersCsv(userId: string): Promise<CsvFile> {
  const { data, error } = await lfDb().from("orders").select("*").eq("user_id", userId).eq("test", false).neq("status", "draft").order("created_at", { ascending: false }).limit(5000);
  if (error) return { ok: false, status: 500, error: error.message };
  const head = ["order", "date", "status", "in_courier_file", "product", "item_code", "qty", "unit_price", "delivery_fee", "total", "name", "address", "phone", "phone_2", "whatsapp", "ad_id"];
  const body = (data ?? []).map((o) => [o.id, o.confirmed_at ?? o.created_at, o.status, o.exported_at ? "yes" : "no", o.product_name, o.product_id, o.qty, o.unit_price, o.delivery_fee, o.total, o.name, o.address, o.phone1, o.phone2, local(o.phone), o.ad_id ?? ""]);
  return { ok: true, body: csv([head, ...body]), filename: `lingo_feeder_orders_${today()}.csv`, count: body.length };
}

/** The next courier file. Its orders are marked as sent to Feeder (Undo on each order puts one back). */
export async function courierCsv(userId: string): Promise<CsvFile> {
  const db = lfDb();
  const { data, error } = await db
    .from("orders")
    .select("id, phone, name, address, phone1, phone2, unit_price, qty, product_id, delivery_fee")
    .eq("user_id", userId).eq("test", false).eq("status", "confirmed").is("exported_at", null)
    .order("confirmed_at").limit(2000);
  if (error) return { ok: false, status: 500, error: error.message };
  const list = data ?? [];
  if (!list.length) return { ok: false, status: 404, error: "No new confirmed orders." };
  const rows = list.map((o) => {
    const tp1 = local(o.phone1) || local(o.phone);
    const tp2 = local(o.phone2) || (local(o.phone) !== tp1 ? local(o.phone) : tp1);
    return [String(o.name ?? "").trim(), String(o.address ?? "").replace(/\s*[\r\n]+\s*/g, ", ").trim(), tp1, tp2, Number(o.unit_price ?? 0), o.qty, o.product_id ?? "", Number(o.delivery_fee ?? 0)];
  });
  const { error: e2 } = await db.from("orders").update({ exported_at: new Date().toISOString() }).eq("user_id", userId).in("id", list.map((o) => o.id));
  if (e2) return { ok: false, status: 500, error: e2.message };
  await db.from("events").insert({ user_id: userId, type: "courier_file", detail: { orders: list.length } });
  return { ok: true, body: csv([["name", "address", "tp_1", "tp_2", "price", "qty", "item_code", "delivery"], ...rows]), filename: `${today()}(${list.length}).csv`, count: list.length };
}

export function csvResponse(file: Extract<CsvFile, { ok: true }>) {
  return new Response(file.body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file.filename}"`,
      "x-lingo-orders": String(file.count),
      "cache-control": "no-store",
    },
  });
}
