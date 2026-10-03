import type { ReactNode } from "react";
import { AdminShell } from "@/components/shell/admin-shell";
import { requireStaffPage } from "@/lib/auth";
import { webUrl } from "@/lib/env";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaffPage();
  const { supabase } = staff;
  const [products, waiting, proofs, messages] = await Promise.all([
    supabase.from("products").select("slug, name, short_name, color_light, status").order("sort_order"),
    supabase.from("staff_orders").select("id", { count: "exact", head: true }).in("status", ["submitted", "reviewing"]),
    supabase.from("staff_orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_payment").gt("pending_payments", 0),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  return (
    <AdminShell
      role={staff.role}
      name={staff.profile.full_name ?? ""}
      email={staff.user.email ?? ""}
      products={products.data ?? []}
      counts={{ requests: (waiting.count ?? 0) + (proofs.count ?? 0), messages: messages.count ?? 0 }}
      webUrl={webUrl()}
    >
      {children}
    </AdminShell>
  );
}
