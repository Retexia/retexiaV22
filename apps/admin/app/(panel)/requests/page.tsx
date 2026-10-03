import { can } from "@retexia/supabase";
import { Button } from "@retexia/ui";
import { LinkTabs, PageHeader, Pagination } from "@retexia/ui/admin";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { RequestsTable } from "@/components/requests/requests-table";
import { requireStaffPage } from "@/lib/auth";
import { PAGE_SIZE, listParams, param, withParams, type SearchParams } from "@/lib/list-params";
import { REQUEST_TABS, listRequests, requestTabCounts } from "@/lib/queries/requests";

export const metadata: Metadata = { title: "Requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const staff = await requireStaffPage("view");
  const { supabase } = staff;
  const [{ rows, count, tab }, counts, products, packages, statuses, team, views, transitions] = await Promise.all([
    listRequests(staff, sp),
    requestTabCounts(staff, sp),
    supabase.from("products").select("id, slug, short_name").order("sort_order"),
    supabase.from("packages").select("id, name, product_id").order("sort_order"),
    supabase.from("order_statuses").select("key, label").order("sort_order"),
    supabase.from("profiles").select("id, full_name, email").in("role", ["support", "admin", "owner"]).order("full_name"),
    supabase.from("admin_saved_views").select("id, name, filters").eq("page", "/requests").order("created_at"),
    supabase.from("order_status_transitions").select("from_status, to_status, action_label, min_roles").order("sort_order"),
  ]);
  const { page } = listParams(sp, { id: "created_at", desc: true });
  const selectedProduct = (products.data ?? []).find((p) => p.slug === param(sp, "product"));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Requests"
        description="Every request from the website, WhatsApp and referrals."
        actions={
          can(staff.role, "operate") ? (
            <Button href="/requests/new" icon={<Plus aria-hidden size={16} strokeWidth={1.5} />}>
              New request
            </Button>
          ) : null
        }
      />
      <LinkTabs
        label="Request groups"
        items={REQUEST_TABS.map((t) => ({
          href: withParams("/requests", sp, { tab: t.key === "needs_action" ? null : t.key }),
          label: t.label,
          active: tab === t.key,
          count: counts[t.key],
        }))}
      />
      <RequestsTable
        rows={rows}
        canOperate={can(staff.role, "operate")}
        role={staff.role}
        transitions={transitions.data ?? []}
        team={(team.data ?? []).map((m) => ({ id: m.id, name: m.full_name || m.email || "Team member" }))}
        views={(views.data ?? []).map((v) => ({ id: v.id, name: v.name, query: String((v.filters as { query?: string })?.query ?? "") }))}
        filters={[
          { key: "product", label: "Product", options: (products.data ?? []).map((p) => ({ value: p.slug, label: p.short_name })) },
          {
            key: "package",
            label: "Package",
            options: (packages.data ?? [])
              .filter((p) => !selectedProduct || p.product_id === selectedProduct.id)
              .map((p) => ({ value: p.id, label: p.name })),
          },
          { key: "status", label: "Status", options: (statuses.data ?? []).map((s) => ({ value: s.key, label: s.label })) },
          {
            key: "assigned",
            label: "Assigned",
            options: [
              { value: "me", label: "Me" },
              { value: "none", label: "Nobody" },
              ...(team.data ?? []).map((m) => ({ value: m.id, label: m.full_name || m.email || "Team member" })),
            ],
          },
          {
            key: "source",
            label: "Source",
            options: ["website", "whatsapp", "referral", "admin"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })),
          },
          { key: "billing", label: "Billing", options: [{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }] },
          { key: "renewal", label: "Renewal", options: [{ value: "due", label: "Due in 7 days" }, { value: "overdue", label: "Overdue" }] },
        ]}
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={count} hrefFor={(p) => withParams("/requests", sp, { page: p })} />}
        emptyText={tab === "needs_action" && count === 0 && !param(sp, "q") ? "No requests waiting. Nice." : "No requests match these filters."}
      />
    </div>
  );
}
