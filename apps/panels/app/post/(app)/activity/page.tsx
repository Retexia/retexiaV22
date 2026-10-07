import { Card, formatDate } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import Link from "next/link";
import { PLAN_LIMITS } from "@/lib/post/plans";
import { requireBusinessPage } from "@/lib/post/session";
import { localDate } from "@/lib/time";

export const metadata = { title: "Activity and usage" };

const EVENT_LABEL: Record<string, string> = {
  batch_ready: "Today's posts are ready",
  published: "Post published",
  publish_failed: "A post could not be published",
  reconnect_needed: "An account needs reconnecting",
  allowance_80: "80% of a monthly allowance used",
  needs_manual: "A post needs you",
  post_requested: "You asked for a new post",
  retry_requested: "You retried a post",
  data_deletion: "Data deletion completed",
};

export default async function ActivityPage() {
  const { business, db } = await requireBusinessPage("/activity");
  const period = `${localDate(business.timezone).slice(0, 7)}-01`;
  const [{ data: usage }, { data: events }] = await Promise.all([
    db.from("usage_monthly").select("*").eq("business_id", business.id).eq("period", period).maybeSingle(),
    db.from("events").select("id, type, payload, created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(60),
  ]);
  const limits = PLAN_LIMITS[business.plan];
  const meters = [
    { label: "AI designs", used: usage?.images ?? 0, limit: limits.images },
    { label: "Reels", used: usage?.videos ?? 0, limit: limits.videos },
    { label: "New versions (regenerations)", used: usage?.regenerations ?? 0, limit: limits.regenerations },
    ...(limits.ai_videos ? [{ label: "AI video clips", used: usage?.ai_videos ?? 0, limit: limits.ai_videos }] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Activity and usage" description={`${limits.label} plan · allowances reset on the 1st of each month. When one runs out, posts use your own photos instead of stopping.`} />
      <Card className="grid gap-5 sm:grid-cols-2">
        {meters.map((m) => {
          const pct = m.limit ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
          return (
            <div key={m.label} className="flex flex-col gap-1.5">
              <span className="flex justify-between type-small">
                <span className="text-ink">{m.label}</span>
                <span className="text-ink-muted">
                  {m.used} of {m.limit}
                </span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-sunk" role="meter" aria-valuenow={m.used} aria-valuemin={0} aria-valuemax={m.limit} aria-label={m.label}>
                <span className={`block h-full rounded-full ${pct >= 80 ? "bg-warning" : "bg-brand"}`} style={{ width: `${pct}%` }} />
              </span>
            </div>
          );
        })}
        <p className="type-small text-ink-muted sm:col-span-2">Caption rewrites and edits are unlimited.</p>
      </Card>
      <Card padded={false}>
        <h2 className="border-b border-line px-5 py-3 type-h3 text-ink">Recent activity</h2>
        {(events ?? []).length ? (
          <ul className="divide-y divide-line">
            {(events ?? []).map((e) => {
              const p = (e.payload ?? {}) as { post_id?: string; prompt?: string };
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span className="flex flex-col">
                    <span className="type-body text-ink">{EVENT_LABEL[e.type] ?? e.type.replace(/_/g, " ")}</span>
                    {p.prompt ? <span className="truncate type-small text-ink-muted">“{p.prompt}”</span> : null}
                  </span>
                  <span className="flex items-center gap-3 type-small text-ink-muted">
                    {p.post_id ? (
                      <Link href={`/posts/${p.post_id}`} className="text-link">
                        Open post
                      </Link>
                    ) : null}
                    {formatDate(e.created_at, "en-LK", true)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center type-body text-ink-muted">Nothing yet.</p>
        )}
      </Card>
    </div>
  );
}
