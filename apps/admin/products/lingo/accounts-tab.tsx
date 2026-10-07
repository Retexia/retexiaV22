import { Alert, Badge, Card, EmptyState, formatDate, formatPrice } from "@retexia/ui";
import { StatCard } from "@retexia/ui/admin";
import { Bot } from "lucide-react";
import Link from "next/link";
import type { HubTabContext } from "../registry";
import { listLingoAccounts } from "./data";
import { NewLingoAccountButton } from "./new-account-button";

/** Products → Lingo → Bot accounts: every WhatsApp bot, its customer and how it is doing. */
export async function LingoAccountsTab({ staff }: HubTabContext) {
  const { rows, error } = await listLingoAccounts();
  const isAdmin = staff.role === "admin" || staff.role === "owner";
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert tone="danger" title="Can't read the Lingo database">
          {error}. Check that migrations 0006 and 0007 have run and that <code>lingo</code> is in Supabase → Settings → API → Exposed schemas.
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bots answering" value={`${rows.filter((r) => r.active).length} of ${rows.length}`} hint={`${rows.filter((r) => !r.owner_id).length} not connected to a customer`} />
        <StatCard label="Customer messages (30 days)" value={sum((r) => r.stats.messages_30d).toLocaleString("en-LK")} />
        <StatCard label="Orders (30 days)" value={sum((r) => r.stats.orders_30d).toLocaleString("en-LK")} hint={`${sum((r) => r.stats.open_orders)} waiting to be sent`} />
        <StatCard label="Sales through Lingo (30 days)" value={formatPrice(sum((r) => r.stats.sales_30d), "LKR")} />
      </div>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-h2 text-ink">Bot accounts</h2>
          {isAdmin ? <NewLingoAccountButton /> : null}
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] type-body">
              <thead>
                <tr className="text-left type-small text-ink-muted">
                  <th className="py-2 pr-4 font-medium">Business</th>
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 font-medium">Bot</th>
                  <th className="py-2 pr-4 text-right font-medium">Messages 30d</th>
                  <th className="py-2 pr-4 text-right font-medium">Orders 30d</th>
                  <th className="py-2 pr-4 text-right font-medium">Sales 30d</th>
                  <th className="py-2 font-medium">Last message</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="py-2.5 pr-4">
                      <Link href={`/products/lingo/accounts/${r.id}`} className="text-ink underline-offset-4 hover:underline">
                        {r.business_name}
                      </Link>
                      <span className="block type-small text-ink-muted">
                        #{r.id} · {r.evolution_instance}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {r.owner ? (
                        <>
                          <Link href={`/customers/${r.owner.id}`} className="text-ink underline-offset-4 hover:underline">
                            {r.owner.name}
                          </Link>
                          {r.owner.orderRef ? (
                            <Link href={`/requests/${encodeURIComponent(r.owner.orderRef)}`} className="block type-small text-ink-muted hover:underline">
                              {r.owner.orderRef}
                            </Link>
                          ) : null}
                        </>
                      ) : (
                        <Badge tone="warning">Not connected</Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={r.active ? "success" : "neutral"}>{r.active ? "On" : "Off"}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{r.stats.messages_30d.toLocaleString("en-LK")}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {r.stats.orders_30d}
                      {r.stats.open_orders ? <span className="block type-small text-warning">{r.stats.open_orders} to send</span> : null}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{formatPrice(r.stats.sales_30d, "LKR")}</td>
                    <td className="py-2.5 type-small text-ink-muted">{r.stats.last_message_at ? formatDate(r.stats.last_message_at, "en-LK", true) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Bot aria-hidden size={24} strokeWidth={1.5} />} title="No bot accounts yet">
            Create one here, or from a Lingo request&apos;s Setup tab so it is connected to that customer straight away.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
