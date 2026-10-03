"use server";

import type { CommandGroup } from "@retexia/ui/admin";
import { requireRole } from "@/lib/auth";
import { ilike } from "@/lib/list-params";

/** ⌘K live results: requests by ref/customer, customers, products, pages. */
export async function searchEverything(query: string): Promise<CommandGroup[]> {
  const { supabase } = await requireRole("view");
  const term = ilike(query);
  const [orders, customers, products, pages] = await Promise.all([
    supabase.from("staff_orders").select("ref, customer_name, product_short_name, status_label").ilike("search", term).limit(6),
    supabase.from("staff_customers").select("id, full_name, email, phone").ilike("search", term).limit(6),
    supabase.from("products").select("slug, name").or(`name.ilike.${term},slug.ilike.${term}`).limit(5),
    supabase.from("pages").select("id, title, slug").or(`title.ilike.${term},slug.ilike.${term}`).limit(5),
  ]);
  return [
    {
      heading: "Requests",
      items: (orders.data ?? []).map((o) => ({
        id: o.ref ?? "",
        label: `${o.ref} · ${o.customer_name ?? "Customer"}`,
        hint: `${o.product_short_name ?? ""} · ${o.status_label ?? ""}`,
        href: `/requests/${encodeURIComponent(o.ref ?? "")}`,
      })),
    },
    {
      heading: "Customers",
      items: (customers.data ?? []).map((c) => ({
        id: c.id ?? "",
        label: c.full_name || c.email || "Customer",
        hint: [c.email, c.phone].filter(Boolean).join(" · "),
        href: `/customers/${c.id}`,
      })),
    },
    {
      heading: "Products",
      items: (products.data ?? []).map((p) => ({ id: p.slug, label: p.name, hint: `/${p.slug}`, href: `/products/${p.slug}` })),
    },
    {
      heading: "Pages",
      items: (pages.data ?? []).map((p) => ({ id: p.id, label: p.title, hint: `/${p.slug}`, href: `/website/pages/${p.id}` })),
    },
  ];
}
