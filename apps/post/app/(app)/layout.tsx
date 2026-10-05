import type { ReactNode } from "react";
import { PostShell } from "@/components/post-shell";
import { webUrl } from "@/lib/env";
import { PLAN_LIMITS } from "@/lib/plans";
import { requireBusinessPage } from "@/lib/session";
import { localDate } from "@/lib/time";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { customer, business, businesses, settings, db } = await requireBusinessPage();
  const period = `${localDate(business.timezone).slice(0, 7)}-01`;
  const [{ data: usage }, { count: attention }] = await Promise.all([
    db.from("usage_monthly").select("images").eq("business_id", business.id).eq("period", period).maybeSingle(),
    db.from("posts").select("id", { count: "exact", head: true }).eq("business_id", business.id).in("status", ["needs_manual", "failed"]).gte("local_date", localDate(business.timezone)),
  ]);
  return (
    <PostShell
      business={{ id: business.id, name: business.name }}
      businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
      attention={attention ?? 0}
      usage={{ used: usage?.images ?? 0, limit: PLAN_LIMITS[business.plan].images }}
      paused={settings.paused}
      webUrl={webUrl()}
      email={customer.email}
    >
      {children}
    </PostShell>
  );
}
