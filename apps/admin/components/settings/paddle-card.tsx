import { Alert, Badge, Card, formatDate, formatPrice } from "@retexia/ui";
import { createAdminClient } from "@retexia/supabase/admin";
import { adminUrl } from "@/lib/env";
import { paddleConfigured, paddleDashboard, paddleEnv } from "@/lib/paddle";
import { PaddleSyncButton } from "./paddle-sync";

const EVENTS = "transaction.completed, subscription.created, subscription.updated, subscription.activated, subscription.past_due, subscription.paused, subscription.resumed, subscription.canceled, adjustment.created, adjustment.updated";

/** Settings → Payments: Paddle status, catalog sync, webhook setup and the latest events. */
export async function PaddleCard({ currency }: { currency: string }) {
  const db = createAdminClient();
  const [{ data: packages }, { data: events }] = await Promise.all([
    db.from("packages").select("id, name, price_monthly, price_yearly, setup_fee, is_active, paddle_price_monthly, paddle_price_yearly, paddle_price_setup, products!inner(name, status)").order("sort_order"),
    db.from("paddle_events").select("id, event_type, received_at, processed_at, error").order("received_at", { ascending: false }).limit(10),
  ]);
  const env = paddleEnv();
  const api = paddleConfigured();
  const secret = Boolean(process.env.PADDLE_WEBHOOK_SECRET);
  const rows = (packages ?? []).filter((p) => (p.products as unknown as { status: string }).status !== "hidden");
  const synced = rows.filter((p) => p.paddle_price_monthly).length;
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="type-h2 text-ink">Paddle</h2>
          <p className="type-body text-ink-muted">Customers pay by card, Apple Pay, Google Pay or PayPal. Paddle is the Merchant of Record: it charges, handles tax and pays you out.</p>
        </div>
        <span className="flex gap-2">
          <Badge tone={env === "production" ? "success" : "warning"}>{env === "production" ? "Live" : "Sandbox (test)"}</Badge>
          <Badge tone={api ? "success" : "danger"}>{api ? "API key set" : "No API key"}</Badge>
          <Badge tone={secret ? "success" : "danger"}>{secret ? "Webhook secret set" : "No webhook secret"}</Badge>
        </span>
      </div>

      {!api || !secret ? (
        <Alert tone="warning" title="Finish the setup">
          Add PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET and NEXT_PUBLIC_PADDLE_ENV to the admin&apos;s environment, and PADDLE_API_KEY, NEXT_PUBLIC_PADDLE_CLIENT_TOKEN and
          NEXT_PUBLIC_PADDLE_ENV to the website&apos;s. See docs/PADDLE.md.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="type-h3 text-ink">Plans in Paddle ({synced} of {rows.length})</h3>
          <PaddleSyncButton disabled={!api} />
        </div>
        <p className="type-small text-ink-muted">Creates or updates a Paddle product per product and a monthly, yearly and setup-fee price per plan. Run it again after you change a price.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] type-small">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Monthly</th>
                <th className="py-2 pr-4 font-medium">Yearly</th>
                <th className="py-2 font-medium">Setup fee</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-2 pr-4 text-ink">
                    {(p.products as unknown as { name: string }).name} · {p.name}
                  </td>
                  {(
                    [
                      [p.price_monthly, p.paddle_price_monthly],
                      [p.price_yearly, p.paddle_price_yearly],
                      [p.setup_fee, p.paddle_price_setup],
                    ] as const
                  ).map(([amount, id], i) => (
                    <td key={i} className="py-2 pr-4">
                      {amount !== null && Number(amount) > 0 ? formatPrice(Number(amount), currency) : "—"}
                      {id ? (
                        <a href={paddleDashboard(`/products-v2`)} target="_blank" rel="noreferrer" className="block font-mono text-[11px] text-ink-muted hover:underline">
                          {id}
                        </a>
                      ) : amount !== null && Number(amount) > 0 ? (
                        <span className="block text-warning">not synced</span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <h3 className="type-h3 text-ink">Webhook</h3>
        <p className="type-small text-ink-muted">
          Paddle → Developer tools → Notifications → New destination. URL: <code className="select-all">{adminUrl()}/api/paddle/webhook</code>. Events: {EVENTS}. Copy its secret key
          into PADDLE_WEBHOOK_SECRET.
        </p>
        {events?.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 type-small">
                <span className="font-mono text-ink">{e.event_type}</span>
                <span className="flex items-center gap-2 text-ink-muted">
                  {formatDate(e.received_at, "en-LK", true)}
                  {e.error ? <Badge tone="danger">{e.error.slice(0, 60)}</Badge> : e.processed_at ? <Badge tone="success">Done</Badge> : <Badge tone="warning">Waiting</Badge>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-small text-ink-muted">No events received yet.</p>
        )}
      </div>
    </Card>
  );
}
