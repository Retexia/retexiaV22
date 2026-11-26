import { Alert, formatDate } from "@retexia/ui";
import { PageHeader, Pagination } from "@retexia/ui/admin";
import Link from "next/link";
import { CustomersTable } from "@/components/customers/customers-table";
import { requireStaffPage } from "@/lib/auth";
import { PAGE_SIZE, listParams, withParams, type SearchParams } from "@/lib/list-params";
import { listCustomers } from "@/lib/queries/customers";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const staff = await requireStaffPage("view");
  const [{ rows, count }, products, views, settings, deletions] = await Promise.all([
    listCustomers(staff, sp),
    staff.supabase.from("products").select("slug, short_name").order("sort_order"),
    staff.supabase.from("admin_saved_views").select("id, name, filters").eq("page", "/customers").order("created_at"),
    staff.supabase.from("site_settings").select("currency_code").eq("id", 1).maybeSingle(),
    staff.supabase.from("account_deletion_requests").select("id, user_id, email, created_at, source").eq("status", "pending").order("created_at").limit(20),
  ]);
  const { page } = listParams(sp, { id: "created_at", desc: true });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Customers" description="Everyone with a retexia.com account. Search by name, email, phone or business." />
      {deletions.data?.length ? (
        <Alert tone="danger" title={`${deletions.data.length} ${deletions.data.length === 1 ? "person asked" : "people asked"} to delete their account`}>
          <ul className="mt-1 flex flex-col gap-1">
            {deletions.data.map((d) => (
              <li key={d.id}>
                {d.user_id ? (
                  <Link href={`/customers/${d.user_id}`} className="text-link underline-offset-2 hover:underline">
                    {d.email ?? "Customer"}
                  </Link>
                ) : (
                  d.email
                )}{" "}
                · {formatDate(d.created_at)} · from the {d.source === "app" ? "app" : "website"}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
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
