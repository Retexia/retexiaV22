import { NextResponse, type NextRequest } from "next/server";
import type { OrderStatus } from "@/lib/lingo/db.types";
import { requireLingo } from "@/lib/lingo/session";

const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const GROUPS: Record<string, OrderStatus[]> = {
  todo: ["confirmed", "processing"],
  shipped: ["shipped"],
  delivered: ["delivered"],
  draft: ["draft"],
  cancelled: ["cancelled"],
};

export async function GET(request: NextRequest) {
  try {
    const { tenant, db } = await requireLingo();
    const statuses = GROUPS[request.nextUrl.searchParams.get("status") ?? ""] ?? (["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"] as OrderStatus[]);
    const { data } = await db.from("orders").select("*").eq("lingo_user_id", tenant.id).in("status", statuses).order("created_at", { ascending: false }).limit(10000);
    const head = ["Order", "Date", "Status", "Product", "Quantity", "Unit price", "Delivery", "Total", "Name", "Address", "Phone", "Cancel reason"];
    const rows = (data ?? []).map((o) => [o.id, o.created_at.slice(0, 10), o.status, o.product_name, o.quantity, o.unit_price, o.delivery_fee, o.total_price, o.customer_name, o.address, o.delivery_phone, o.cancel_reason]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="lingo-orders-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
}
