import { can } from "@retexia/supabase";
import { Button, EmptyState } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { Boxes, Plus } from "lucide-react";
import { ProductsGrid, type ProductCardRow } from "@/components/products/products-grid";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Products" };

const OPEN = ["submitted", "reviewing", "awaiting_payment", "setting_up"];

export default async function ProductsPage() {
  const { supabase, role } = await requireStaffPage("view");
  const canManage = can(role, "manageProducts");
  const [{ data: products }, { data: packages }, { data: orders }, { data: waitlist }, { data: dashboard }, { data: settings }] = await Promise.all([
    supabase.from("products").select("id, slug, name, short_name, code, icon, status, tagline").order("sort_order"),
    supabase.from("packages").select("product_id"),
    supabase.from("orders").select("product_id, status").in("status", [...OPEN, "active"]).limit(10000),
    supabase.from("waitlist").select("product_id").limit(10000),
    supabase.rpc("admin_dashboard", {}),
    supabase.from("site_settings").select("currency_code").eq("id", 1).maybeSingle(),
  ]);
  const count = <T extends { product_id: string }>(rows: T[] | null, id: string, f: (r: T) => boolean = () => true) => (rows ?? []).filter((r) => r.product_id === id && f(r)).length;
  const mrr = new Map(((dashboard as { mrr_by_product?: { product_id: string; mrr: number }[] } | null)?.mrr_by_product ?? []).map((m) => [m.product_id, Number(m.mrr)]));
  const rows: ProductCardRow[] = (products ?? []).map((p) => ({
    ...p,
    packages: count(packages, p.id),
    open: count(orders, p.id, (o) => OPEN.includes(o.status)),
    active: count(orders, p.id, (o) => o.status === "active"),
    mrr: mrr.get(p.id) ?? 0,
    waitlist: count(waitlist, p.id),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description={canManage ? "Everything Retexia sells. Drag to change the order on the website." : "Everything Retexia sells."}
        actions={
          canManage ? (
            <Button href="/products/new" icon={<Plus aria-hidden size={16} strokeWidth={1.5} />}>
              New product
            </Button>
          ) : null
        }
      />
      {rows.length ? (
        <ProductsGrid products={rows} currency={settings?.currency_code ?? "LKR"} canManage={canManage} />
      ) : (
        <EmptyState
          title="No products yet"
          icon={<Boxes aria-hidden size={24} strokeWidth={1.5} />}
          actions={canManage ? <Button href="/products/new">Create the first product</Button> : null}
        >
          Products you create appear here, in the menu, and on the website when you make them live.
        </EmptyState>
      )}
    </div>
  );
}
