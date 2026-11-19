import { createAdminClient, createAdminSchemaClient } from "@retexia/supabase/admin";
import { can } from "@retexia/supabase";
import { Alert, Badge, Card, EmptyState } from "@retexia/ui";
import { StatCard } from "@retexia/ui/admin";
import { Megaphone } from "lucide-react";
import Link from "next/link";
import type { HubTabContext } from "../registry";
import { AdAccountButtons, CatalogDraft } from "./account-buttons";

type Row = {
  user_id: string;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_status: string;
  meta_info: { account_name?: string; business_name?: string; page_name?: string; problems?: string[]; checked_at?: string } | null;
  tiktok_advertiser_id: string | null;
  tiktok_status: string;
  tiktok_info: { name?: string; problems?: string[]; checked_at?: string } | null;
  max_daily_spend: number | null;
  currency: string;
  updated_at: string;
};
const TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = { none: "neutral", requested: "warning", connected: "success", problem: "danger" };
const LABEL: Record<string, string> = { none: "—", requested: "Waiting for you", connected: "Connected", problem: "Problem" };

/** Products → Feeder → Ad accounts (Autopublish): confirm customers' ad accounts, launches on hold, new errors. */
export async function FeederAdsTab({ staff }: HubTabContext) {
  const db = createAdminSchemaClient("feeder");
  const [{ data: accounts, error }, { data: held }, { data: drafts }, { count: live }] = await Promise.all([
    db.from("ad_accounts").select("user_id, meta_ad_account_id, meta_page_id, meta_status, meta_info, tiktok_advertiser_id, tiktok_status, tiktok_info, max_daily_spend, currency, updated_at").order("updated_at", { ascending: false }).limit(200),
    db.from("ad_launches").select("ref, user_id, product_name, state, problem, updated_at").in("state", ["blocked", "failed"]).order("updated_at", { ascending: false }).limit(30),
    db.from("ad_error_catalog").select("id, platform, code, subcode, hits, last_seen, admin_note").eq("is_draft", true).order("last_seen", { ascending: false }).limit(30),
    db.from("ad_launches").select("ref", { count: "exact", head: true }).in("state", ["live", "in_review", "partly_live"]),
  ]);
  const rows = (accounts ?? []) as Row[];
  const ids = [...new Set([...rows.map((r) => r.user_id), ...(held ?? []).map((h) => h.user_id as string)])];
  const { data: people } = ids.length ? await createAdminClient().from("profiles").select("id, email, full_name").in("id", ids) : { data: [] };
  const who = (id: string) => (people ?? []).find((p) => p.id === id);
  const canManage = can(staff.role, "manageCustomers");
  const waiting = rows.filter((r) => r.meta_status === "requested" || r.tiktok_status === "requested").length;

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert tone="danger" title="Can't read Autopublish">
          {error.message}. Run migration 0036_feeder_autopublish.sql and check that <code>feeder</code> is in Supabase → Settings → API → Exposed schemas.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting for you to confirm" value={String(waiting)} hint="Ad accounts customers entered" />
        <StatCard label="Launches running" value={String(live ?? 0)} />
        <StatCard label="On hold / failed" value={String((held ?? []).length)} hint={`${(drafts ?? []).length} new error type(s) to describe`} />
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">Ad accounts</h2>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] type-body">
              <thead>
                <tr className="text-left type-small text-ink-muted">
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 font-medium">Meta</th>
                  <th className="py-2 pr-4 font-medium">TikTok</th>
                  <th className="py-2 font-medium">Limit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = who(r.user_id);
                  return (
                    <tr key={r.user_id} className="border-t border-line align-top">
                      <td className="py-3 pr-4">
                        <Link href={`/customers/${r.user_id}`} className="text-ink underline-offset-4 hover:underline">
                          {p?.full_name || p?.email || r.user_id.slice(0, 8)}
                        </Link>
                        <span className="block type-small text-ink-muted">{p?.email}</span>
                      </td>
                      <td className="py-3 pr-4">
                        {r.meta_ad_account_id ? (
                          <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-2">
                              <span className="type-code">act_{r.meta_ad_account_id}</span>
                              <Badge tone={TONE[r.meta_status] ?? "neutral"}>{LABEL[r.meta_status] ?? r.meta_status}</Badge>
                            </span>
                            <span className="type-small text-ink-muted">
                              {[r.meta_info?.account_name, r.meta_info?.business_name && `business: ${r.meta_info.business_name}`, r.meta_info?.page_name && `Page: ${r.meta_info.page_name}`].filter(Boolean).join(" · ") || `Page ${r.meta_page_id}`}
                            </span>
                            {r.meta_info?.problems?.length ? <span className="type-small text-danger">{r.meta_info.problems[0]}</span> : null}
                            <AdAccountButtons userId={r.user_id} platform="meta" status={r.meta_status} canManage={canManage} />
                          </div>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {r.tiktok_advertiser_id ? (
                          <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-2">
                              <span className="type-code">{r.tiktok_advertiser_id}</span>
                              <Badge tone={TONE[r.tiktok_status] ?? "neutral"}>{LABEL[r.tiktok_status] ?? r.tiktok_status}</Badge>
                            </span>
                            {r.tiktok_info?.name ? <span className="type-small text-ink-muted">{r.tiktok_info.name}</span> : null}
                            {r.tiktok_info?.problems?.length ? <span className="type-small text-danger">{r.tiktok_info.problems[0]}</span> : null}
                            <AdAccountButtons userId={r.user_id} platform="tiktok" status={r.tiktok_status} canManage={canManage} />
                          </div>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 type-small text-ink-muted">{r.max_daily_spend != null ? `${r.currency} ${Number(r.max_daily_spend).toLocaleString("en-US")}/day` : "No limit"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Megaphone aria-hidden size={22} strokeWidth={1.5} />} title="No ad accounts yet">
            Customers add theirs in feeder.retexia.com/autopublish/accounts; they show here for you to confirm.
          </EmptyState>
        )}
      </Card>

      {(held ?? []).length ? (
        <Card className="flex flex-col gap-3">
          <h2 className="type-h2 text-ink">Launches on hold or failed</h2>
          <ul className="flex flex-col divide-y divide-line">
            {(held ?? []).map((l) => (
              <li key={l.ref as string} className="flex flex-col gap-0.5 py-2">
                <span className="type-body text-ink">
                  <span className="type-code">{l.ref as string}</span> · {l.product_name as string} · {who(l.user_id as string)?.email ?? ""}
                </span>
                <span className="type-small text-danger">{(l.problem as { message?: string } | null)?.message ?? l.state}</span>
              </li>
            ))}
          </ul>
          <p className="type-small text-ink-muted">Fix the cause (token, access, catalog entry), then the customer presses Retry on the launch, or open it in support mode.</p>
        </Card>
      ) : null}

      {(drafts ?? []).length ? (
        <Card className="flex flex-col gap-3">
          <h2 className="type-h2 text-ink">New errors to describe</h2>
          <ul className="flex flex-col divide-y divide-line">
            {(drafts ?? []).map((d) => (
              <li key={d.id as number} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="type-body text-ink">
                    {d.platform as string} · code {(d.code as string) ?? "—"}
                    {d.subcode ? ` / ${d.subcode as string}` : ""} · seen {d.hits as number}×
                  </span>
                  <span className="type-small text-ink-muted">{(d.admin_note as string) ?? ""}</span>
                </span>
                {canManage ? <CatalogDraft id={d.id as number} note={(d.admin_note as string) ?? ""} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
