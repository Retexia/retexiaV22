import { PageHeader, Pagination } from "@retexia/ui/admin";
import { CustomersTable } from "@/components/customers/customers-table";
import { requireStaffPage } from "@/lib/auth";
import { PAGE_SIZE, listParams, withParams, type SearchParams } from "@/lib/list-params";
import { listCustomers } from "@/lib/queries/customers";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const staff = await requireStaffPage("view");
  const [{ rows, count }, products, views, settings] = await Promise.all([
    listCustomers(staff, sp),
    staff.supabase.from("products").select("slug, short_name").order("sort_order"),
    staff.supabase.from("admin_saved_views").select("id, name, filters").eq("page", "/customers").order("created_at"),
    staff.supabase.from("site_settings").select("currency_code").eq("id", 1).maybeSingle(),
  ]);
  const { page } = listParams(sp, { id: "created_at", desc: true });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Customers" description="Everyone with a retexia.com account. Search by name, email, phone or business." />
      <CustomersTable
        rows={rows}
        currency={settings.data?.currency_code ?? "LKR"}
        views={(views.data ?? []).map((v) => ({ id: v.id, name: v.name, query: String((v.filters as { query?: string })?.query ?? "") }))}
        filters={[
          { key: "product", label: "Active product", options: (products.data ?? []).map((p) => ({ value: p.slug, label: p.short_name })) },
          {
            key: "status",
            label: "Account",
            options: [
              { value: "active", label: "Active" },
              { value: "banned", label: "Banned" },
              { value: "unconfirmed", label: "Email not confirmed" },
            ],
          },
        ]}
        footer={<Pagination page={page} pageSize={PAGE_SIZE} total={count} hrefFor={(p) => withParams("/customers", sp, { page: p })} />}
      />
    </div>
  );
}
