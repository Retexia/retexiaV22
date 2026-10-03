import { NextResponse, type NextRequest } from "next/server";
import { AccessError, requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { csvResponse, toCsv } from "@/lib/csv";
import { ilike, type SearchParams } from "@/lib/list-params";
import { auditQuery } from "@/lib/queries/audit";
import { listCustomers } from "@/lib/queries/customers";
import { listPayments } from "@/lib/queries/payments";
import { listRequests } from "@/lib/queries/requests";

const date = (v: string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : "");

/** CSV export of the current filter (same query as the table, without paging). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const sp: SearchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    if (resource === "requests") {
      const staff = await requireRole("view");
      const { rows } = await listRequests(staff, { tab: "all", ...sp }, { all: true });
      await audit(staff, { action: "export", table: "orders", summary: `Exported ${rows.length} requests` });
      return csvResponse(
        toCsv(rows, [
          { header: "Ref", value: (r) => r.ref },
          { header: "Status", value: (r) => r.status_label ?? r.status },
          { header: "Product", value: (r) => r.product_name },
          { header: "Package", value: (r) => r.package_name },
          { header: "Billing", value: (r) => r.billing_cycle },
          { header: "Price", value: (r) => r.price_amount },
          { header: "Setup fee", value: (r) => r.setup_fee },
          { header: "Currency", value: (r) => r.currency },
          { header: "Paid", value: (r) => r.paid_total },
          { header: "Customer", value: (r) => r.customer_name },
          { header: "Business", value: (r) => r.customer_business },
          { header: "Email", value: (r) => r.customer_email },
          { header: "Phone", value: (r) => r.customer_phone },
          { header: "Assigned to", value: (r) => r.assignee_name },
          { header: "Source", value: (r) => r.source },
          { header: "Submitted", value: (r) => date(r.created_at) },
          { header: "Started", value: (r) => date(r.starts_at) },
          { header: "Renews", value: (r) => date(r.renews_at) },
        ]),
        `retexia-requests-${stamp}.csv`,
      );
    }
    if (resource === "payments") {
      const staff = await requireRole("view");
      const { rows } = await listPayments(staff, sp, { all: true });
      await audit(staff, { action: "export", table: "payments", summary: `Exported ${rows.length} payments` });
      return csvResponse(
        toCsv(rows, [
          { header: "Date paid", value: (r) => date(r.paid_at ?? r.created_at) },
          { header: "Receipt", value: (r) => r.receipt_number },
          { header: "Request", value: (r) => r.order_ref },
          { header: "Product", value: (r) => r.product_short_name },
          { header: "Package", value: (r) => r.package_name },
          { header: "Customer", value: (r) => r.customer_business || r.customer_name },
          { header: "Email", value: (r) => r.customer_email },
          { header: "Kind", value: (r) => r.kind },
          { header: "Amount", value: (r) => r.signed_amount },
          { header: "Currency", value: (r) => r.currency },
          { header: "Method", value: (r) => r.method },
          { header: "Reference", value: (r) => r.reference },
          { header: "Status", value: (r) => r.status },
          { header: "Period from", value: (r) => date(r.period_start) },
          { header: "Period to", value: (r) => date(r.period_end) },
          { header: "Recorded by", value: (r) => r.recorded_by_name },
          { header: "Note", value: (r) => r.note },
        ]),
        `retexia-payments-${stamp}.csv`,
      );
    }
    if (resource === "customers") {
      const staff = await requireRole("view");
      const { rows } = await listCustomers(staff, sp, { all: true });
      await audit(staff, { action: "export", table: "profiles", summary: `Exported ${rows.length} customers` });
      return csvResponse(
        toCsv(rows, [
          { header: "Name", value: (r) => r.full_name },
          { header: "Email", value: (r) => r.email },
          { header: "Phone", value: (r) => r.phone },
          { header: "WhatsApp", value: (r) => r.whatsapp },
          { header: "Business", value: (r) => r.business_name },
          { header: "Active products", value: (r) => r.active_products },
          { header: "Requests", value: (r) => r.orders_count },
          { header: "Lifetime paid", value: (r) => r.lifetime_paid },
          { header: "Joined", value: (r) => date(r.created_at) },
          { header: "Last sign-in", value: (r) => date(r.last_sign_in_at) },
          { header: "Banned", value: (r) => (r.is_banned ? "yes" : "no") },
        ]),
        `retexia-customers-${stamp}.csv`,
      );
    }
    if (resource === "waitlist") {
      const staff = await requireRole("view");
      let q = staff.supabase.from("waitlist").select("email, created_at, products(name, slug)").order("created_at", { ascending: false }).limit(20000);
      if (sp.product) q = q.eq("product_id", String(sp.product));
      const { data } = await q;
      await audit(staff, { action: "export", table: "waitlist", summary: `Exported ${data?.length ?? 0} waitlist emails` });
      return csvResponse(
        toCsv(data ?? [], [
          { header: "Email", value: (r) => r.email },
          { header: "Product", value: (r) => (r.products as { name?: string } | null)?.name },
          { header: "Joined", value: (r) => date(r.created_at) },
        ]),
        `retexia-waitlist-${stamp}.csv`,
      );
    }
    if (resource === "messages") {
      const staff = await requireRole("view");
      let q = staff.supabase.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(20000);
      if (sp.status) q = q.eq("status", String(sp.status));
      if (sp.q) q = q.or(`name.ilike.${ilike(String(sp.q))},email.ilike.${ilike(String(sp.q))},message.ilike.${ilike(String(sp.q))}`);
      const { data } = await q;
      return csvResponse(
        toCsv(data ?? [], [
          { header: "Date", value: (r) => date(r.created_at) },
          { header: "Status", value: (r) => r.status },
          { header: "Name", value: (r) => r.name },
          { header: "Email", value: (r) => r.email },
          { header: "Phone", value: (r) => r.phone },
          { header: "Business", value: (r) => r.business_name },
          { header: "Message", value: (r) => r.message },
          { header: "Page", value: (r) => r.source_path },
        ]),
        `retexia-messages-${stamp}.csv`,
      );
    }
    if (resource === "audit") {
      const staff = await requireRole("manageSettings");
      const { data } = await auditQuery(staff, sp).limit(20000);
      await audit(staff, { action: "export", table: "audit_logs", summary: `Exported ${data?.length ?? 0} audit entries` });
      return csvResponse(
        toCsv(data ?? [], [
          { header: "When", value: (r) => r.created_at },
          { header: "Who", value: (r) => r.actor_email },
          { header: "Role", value: (r) => r.actor_role },
          { header: "Action", value: (r) => r.action },
          { header: "Table", value: (r) => r.table_name },
          { header: "Record", value: (r) => r.record_id },
          { header: "Summary", value: (r) => r.summary },
        ]),
        `retexia-audit-${stamp}.csv`,
      );
    }
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
