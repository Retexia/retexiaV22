import { can } from "@retexia/supabase";
import { formatPrice } from "@retexia/ui";
import { LinkTabs, PageHeader, Pagination, StatCard } from "@retexia/ui/admin";
import { PaymentsTable } from "@/components/payments/payments-table";
import { requireStaffPage } from "@/lib/auth";
import { PAGE_SIZE, listParams, param, withParams, type SearchParams } from "@/lib/list-params";
import { listPayments, paymentTotals } from "@/lib/queries/payments";

export const metadata = { title: "Payments" };

const words = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const staff = await requireStaffPage("view");
  const [{ rows, count }, totals, products, views, settings] = await Promise.all([
    listPayments(staff, sp),
    paymentTotals(staff, sp),
    staff.supabase.from("products").select("slug, short_name").order("sort_order"),
    staff.supabase.from("admin_saved_views").select("id, name, filters").eq("page", "/payments").order("created_at"),
    staff.supabase.from("site_settings").select("currency_code").eq("id", 1).maybeSingle(),
  ]);
  const currency = settings.data?.currency_code ?? "LKR";
  const { page } = listParams(sp, { id: "created_at", desc: true });
  const tab = param(sp, "tab") === "proofs" ? "proofs" : "all";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payments" description="Everything paid, pending and refunded. Totals follow the filters." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Confirmed" value={formatPrice(totals.confirmed, currency)} tone="success" />
        <StatCard label="Pending" value={formatPrice(totals.pending, currency)} tone={totals.pending ? "warning" : "neutral"} />
        <StatCard label="Refunded" value={formatPrice(totals.refunded, currency)} />
        <StatCard label="Proofs to check" value={totals.proofs} tone={totals.proofs ? "warning" : "neutral"} href="/payments?tab=proofs" />
      </div>
      <LinkTabs
        label="Payment groups"
        items={[
          { href: withParams("/payments", sp, { tab: null }), label: "All payments", active: tab === "all" },
          { href: withParams("/payments", sp, { tab: "proofs" }), label: "Pending proofs", active: tab === "proofs", count: totals.proofs },
        ]}
      />
      <PaymentsTable
        rows={rows}
        canOperate={can(staff.role, "operate")}
        canAdmin={can(staff.role, "manageSettings")}
        openRecord={param(sp, "record") === "1"}
        views={(views.data ?? []).map((v) => ({ id: v.id, name: v.name, query: String((v.filters as { query?: string })?.query ?? "") }))}
        filters={[
          { key: "product", label: "Product", options: (products.data ?? []).map((p) => ({ value: p.slug, label: p.short_name })) },
          { key: "kind", label: "Kind", options: ["setup_fee", "subscription", "addon", "refund", "other"].map((k) => ({ value: k, label: words(k) })) },
          { key: "method", label: "Method", options: ["bank_transfer", "cash", "card", "online_gateway", "other"].map((k) => ({ value: k, label: words(k) })) },
          { key: "status", label: "Status", options: ["pending", "confirmed", "failed", "refunded"].map((k) => ({ value: k, label: words(k) })) },
        ]}
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={count} hrefFor={(p) => withParams("/payments", sp, { page: p })} />}
        emptyText={tab === "proofs" ? "No proofs waiting. Nice." : "No payments match these filters."}
      />
    </div>
  );
}
