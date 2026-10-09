import { can } from "@retexia/supabase";
import { Badge, Button, Card, formatDate } from "@retexia/ui";
import { DescriptionList, PageHeader, StatCard } from "@retexia/ui/admin";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireStaffPage } from "@/lib/auth";
import { PostAccountSwitch, PostBusinessControls, PostOwnerChange } from "@/products/post/controls";
import { getPostBusiness, postSystem } from "@/products/post/data";
import { POST_PLANS } from "@/products/post/limits";

export const metadata = { title: "Retexia Post business" };

const STATUS_TONE: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  planned: "neutral",
  generating: "neutral",
  safety_review: "neutral",
  ready: "brand",
  approved: "success",
  publishing: "brand",
  published: "success",
  needs_manual: "warning",
  blocked: "danger",
  failed: "danger",
  expired: "neutral",
  denied: "neutral",
  removed: "neutral",
};
const nice = (s: string) => s.replace(/_/g, " ");
/** Token expires within 7 days. */
const soon = (iso: string | null) => Boolean(iso && new Date(iso).getTime() < Date.now() + 7 * 864e5);

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between type-small">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">
          {used} / {limit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-sunk" role="meter" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function PostBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("operate");
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) notFound();
  const [data, system] = await Promise.all([getPostBusiness(id), postSystem()]);
  if (!data) notFound();
  const { business: b, owner, stats, accounts, failed, upcoming, events } = data;
  const plan = POST_PLANS[b.plan];
  const canAdmin = can(staff.role, "manageSettings");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/products/post?tab=businesses", label: "Businesses" }}
        title={b.name}
        description={`${b.category ?? "Business"} · ${b.country} · ${b.timezone} · since ${formatDate(b.created_at)}`}
        chips={
          <>
            <Badge tone="brand">{plan.label}</Badge>
            {b.settings?.paused ? <Badge tone="warning">Paused</Badge> : null}
            {!b.onboarding_done ? <Badge tone="neutral">Setting up</Badge> : null}
            {system.publishing_paused || system.generation_paused ? <Badge tone="warning">Post is paused for everyone</Badge> : null}
          </>
        }
        actions={
          <Button href={process.env.NEXT_PUBLIC_POST_URL || "https://post.retexia.com"} target="_blank" variant="secondary" size="sm" iconAfter={<ExternalLink aria-hidden size={14} strokeWidth={1.5} />}>
            Customer panel
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Published (7 days)" value={stats.published_7d} hint={stats.last_published_at ? `Last ${formatDate(stats.last_published_at, "en-LK", true)}` : "Nothing yet"} />
        <StatCard label="Scheduled" value={stats.posts_upcoming} hint={`Auto-publish ${b.settings?.auto_publish === false ? "off" : "on"}`} />
        <StatCard label="Problems (7 days)" value={stats.failed_7d + stats.blocked_7d + stats.needs_manual} tone={stats.failed_7d ? "danger" : stats.needs_manual || stats.blocked_7d ? "warning" : "success"} hint={`${stats.failed_7d} failed, ${stats.blocked_7d} blocked, ${stats.needs_manual} need manual`} />
        <StatCard label="AI cost this month" value={`$${stats.est_cost_usd.toFixed(2)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <h2 className="type-h3 text-ink">Facebook and Instagram</h2>
            {accounts.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {accounts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="type-body text-ink capitalize">
                        {a.platform} · {a.display_name ?? a.external_id}
                      </p>
                      <p className="type-small text-ink-muted">
                        {a.platform === "instagram" && a.ig_account_type ? `${a.ig_account_type} account · ` : ""}
                        {a.token_expires_at ? `token expires ${formatDate(a.token_expires_at)}` : "token does not expire"}
                      </p>
                    </div>
                    <span className="flex items-center gap-3">
                      <Badge tone={a.status === "connected" ? (soon(a.token_expires_at) ? "warning" : "success") : "danger"}>
                        {a.status === "connected" ? (soon(a.token_expires_at) ? "Expiring soon" : "Connected") : nice(a.status)}
                      </Badge>
                      <PostAccountSwitch businessId={b.id} accountId={a.id} enabled={a.enabled} label="Post here" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body text-ink-muted">No accounts connected yet.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="type-h3 text-ink">Failed publishes</h2>
            {failed.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {failed.map((f) => (
                  <li key={f.id} className="flex flex-col gap-1 py-3">
                    <span className="type-body text-ink capitalize">
                      {f.social_accounts?.platform ?? "Account"} · {nice(f.posts.format)} for {formatDate(f.posts.scheduled_at, "en-LK", true)}
                    </span>
                    <span className="type-small text-danger">
                      {f.error_kind ? `${nice(f.error_kind)}: ` : ""}
                      {f.last_error ?? "No error message"}
                    </span>
                    <span className="type-small text-ink-muted">{f.attempts} attempts</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body text-ink-muted">No failed publishes.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="type-h3 text-ink">Coming up</h2>
            {upcoming.length ? (
              <ul className="flex flex-col divide-y divide-line">
                {upcoming.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="type-body text-ink">
                        {formatDate(p.scheduled_at, "en-LK", true)} · {nice(p.format)}
                      </span>
                      {p.caption ? <span className="block truncate type-small text-ink-muted">{p.caption}</span> : null}
                    </span>
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{nice(p.status)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body text-ink-muted">Nothing scheduled.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="type-h3 text-ink">Activity</h2>
            {events.length ? (
              <ul className="flex flex-col gap-2">
                {events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 type-small">
                    <span className="text-ink">{nice(e.type)}</span>
                    <span className="text-ink-muted">{formatDate(e.created_at, "en-LK", true)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body text-ink-muted">No activity yet.</p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <PostBusinessControls id={b.id} plan={b.plan} status={b.subscription_status} paused={Boolean(b.settings?.paused)} canAdmin={canAdmin} />
          <Card className="flex flex-col gap-4">
            <h2 className="type-h3 text-ink">This month</h2>
            <p className="type-small text-ink-muted">
              Daily playlist: up to {plan.postsPerDay} posts and {plan.storiesPerDay} stories
            </p>
            <Meter label="AI designs" used={stats.images} limit={plan.images} />
            <Meter label="Redos" used={stats.regenerations} limit={plan.regenerations} />
            <Meter label="Connected accounts" used={stats.accounts_connected} limit={plan.accounts} />
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="type-h3 text-ink">Customer</h2>
            {owner ? (
              <DescriptionList
                items={[
                  { label: "Name", value: <a href={`/customers/${owner.id}`} className="underline-offset-4 hover:underline">{owner.name}</a> },
                  { label: "Email", value: owner.email ?? "—" },
                  { label: "Request", value: owner.orderRef ? <a href={`/requests/${encodeURIComponent(owner.orderRef)}`} className="underline-offset-4 hover:underline">{owner.orderRef}</a> : "None" },
                ]}
              />
            ) : (
              <p className="type-body text-ink-muted">The owner&apos;s Retexia account was not found.</p>
            )}
            {canAdmin ? <PostOwnerChange id={b.id} /> : null}
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="type-h3 text-ink">Schedule</h2>
            <DescriptionList
              items={[
                { label: "Posting times", value: (b.settings?.slots ?? ["09:00", "13:00", "19:00"]).join(", ") },
                { label: "Auto-publish", value: b.settings?.auto_publish === false ? "Off (owner approves each post)" : "On" },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
