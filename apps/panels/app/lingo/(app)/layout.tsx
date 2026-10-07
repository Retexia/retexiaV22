import type { ReactNode } from "react";
import { LingoShell } from "@/components/lingo/lingo-shell";
import { webUrl } from "@/lib/env";
import { requireLingoPage } from "@/lib/lingo/session";

export default async function LingoLayout({ children }: { children: ReactNode }) {
  const { customer, tenant, db } = await requireLingoPage();
  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("lingo_user_id", tenant.id).eq("status", "confirmed");
  return (
    <LingoShell business={tenant.business_name} active={tenant.active} newOrders={count ?? 0} webUrl={webUrl()} email={customer.email}>
      {children}
    </LingoShell>
  );
}
