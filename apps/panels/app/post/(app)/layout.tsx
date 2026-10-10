import type { ReactNode } from "react";
import { FocusProvider } from "@/components/post/focus-select";
import { PostShell } from "@/components/post/post-shell";
import { webUrl } from "@/lib/env";
import { focusChoices } from "@/lib/post/focus-server";
import { PLAN_LIMITS } from "@/lib/post/plans";
import { requireBusinessPage } from "@/lib/post/session";
import { localDate } from "@/lib/time";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { customer, business, businesses, settings, db } = await requireBusinessPage();
  const period = `${localDate(business.timezone).slice(0, 7)}-01`;
  const [{ data: usage }, { count: attention }, choices] = await Promise.all([
    db.from("usage_monthly").select("images").eq("business_id", business.id).eq("period", period).maybeSingle(),
    db.from("posts").select("id", { count: "exact", head: true }).eq("business_id", business.id).in("status", ["needs_manual", "failed"]).gte("local_date", localDate(business.timezone)),
    focusChoices(db, business.id),
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
      <FocusProvider choices={choices}>{children}</FocusProvider>
    </PostShell>
  );
}
