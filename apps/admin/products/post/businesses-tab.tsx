import { can } from "@retexia/supabase";
import { Alert, Badge, Card, EmptyState, formatDate } from "@retexia/ui";
import { StatCard } from "@retexia/ui/admin";
import { Megaphone } from "lucide-react";
import Link from "next/link";
import type { HubTabContext } from "../registry";
import { PostSystemSwitches } from "./controls";
import { listPostBusinesses, postSystem } from "./data";
import { POST_PLANS } from "./limits";

const STATUS_TONE = { trialing: "brand", active: "success", past_due: "warning", canceled: "neutral" } as const;
const STATUS_LABEL = { trialing: "Trial", active: "Active", past_due: "Overdue", canceled: "Cancelled" } as const;

/** Products → Post → Businesses: health, usage and cost of every business, plus the global switches. */
export async function PostBusinessesTab({ staff }: HubTabContext) {
  const [{ rows, error }, system] = await Promise.all([listPostBusinesses(), postSystem()]);
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  const attention = rows.filter((r) => r.stats.accounts_reconnect || r.stats.failed_7d || r.stats.tokens_expiring || r.stats.needs_manual);
  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert tone="danger" title="Can't read the Post database">
          {error}. Check that migrations 0005 and 0007 have run and that <code>post</code> is in Supabase → Settings → API → Exposed schemas.
        </Alert>
      ) : null}
      <PostSystemSwitches system={system} canAdmin={can(staff.role, "manageSettings")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Businesses" value={rows.length} hint={`${rows.filter((r) => r.subscription_status === "active").length} paying, ${rows.filter((r) => !r.onboarding_done).length} still setting up`} />
        <StatCard label="Published (7 days)" value={sum((r) => r.stats.published_7d)} hint={`${sum((r) => r.stats.posts_upcoming)} scheduled`} />
        <StatCard label="Need attention" value={attention.length} tone={attention.length ? "warning" : "success"} hint="Failed posts, reconnects, expiring tokens" />
        <StatCard label="AI cost this month" value={`$${sum((r) => r.stats.est_cost_usd).toFixed(2)}`} hint={`${sum((r) => r.stats.images)} images, ${sum((r) => r.stats.regenerations)} redos`} />
      </div>
      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">Businesses</h2>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] type-body">
              <thead>
                <tr className="text-left type-small text-ink-muted">
                  <th className="py-2 pr-4 font-medium">Business</th>
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Accounts</th>
                  <th className="py-2 pr-4 text-right font-medium">Published 7d</th>
                  <th className="py-2 pr-4 font-medium">Problems</th>
                  <th className="py-2 pr-4 text-right font-medium">AI images</th>
                  <th className="py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const limit = POST_PLANS[r.plan].images;
                  const problems = [
                    r.settings?.paused && "Paused",
                    !r.onboarding_done && "Setting up",
                    r.stats.failed_7d && `${r.stats.failed_7d} failed`,
                    r.stats.accounts_reconnect && "Reconnect needed",
                    r.stats.tokens_expiring && "Token expiring",
                    r.stats.needs_manual && `${r.stats.needs_manual} need manual`,
                    r.stats.blocked_7d && `${r.stats.blocked_7d} blocked`,
                  ].filter(Boolean) as string[];
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-2.5 pr-4">
                        <Link href={`/products/post/businesses/${r.id}`} className="text-ink underline-offset-4 hover:underline">
                          {r.name}
                        </Link>
                        <span className="block type-small text-ink-muted">
                          {r.category ?? "—"} · since {formatDate(r.created_at)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {r.owner ? (
                          <Link href={`/customers/${r.owner.id}`} className="text-ink underline-offset-4 hover:underline">
                            {r.owner.name}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">Unknown</span>
                        )}
                        {r.owner?.orderRef ? (
                          <Link href={`/requests/${encodeURIComponent(r.owner.orderRef)}`} className="block type-small text-ink-muted hover:underline">
                            {r.owner.orderRef}
                          </Link>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-4">
                        {POST_PLANS[r.plan].label} <Badge tone={STATUS_TONE[r.subscription_status]}>{STATUS_LABEL[r.subscription_status]}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">{r.stats.accounts_connected}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{r.stats.published_7d}</td>
                      <td className="py-2.5 pr-4">
                        {problems.length ? (
                          <span className="flex flex-wrap gap-1">
                            {problems.map((p) => (
                              <Badge key={p} tone={p === "Setting up" ? "neutral" : "warning"}>
                                {p}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="type-small text-ink-muted">None</span>
                        )}
                      </td>
                      <td className={`py-2.5 pr-4 text-right tabular-nums ${r.stats.images >= limit * 0.8 ? "text-warning" : ""}`}>
                        {r.stats.images} / {limit}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">${r.stats.est_cost_usd.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Megaphone aria-hidden size={24} strokeWidth={1.5} />} title="No businesses yet">
            Customers with an active Post request set up their business at post.retexia.com.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
