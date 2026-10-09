import { Alert, Badge, Card, formatDate } from "@retexia/ui";
import { createAdminClient } from "@retexia/supabase/admin";
import { adminUrl } from "@/lib/env";
import { paddleConfigured, paddleEnv } from "@/lib/paddle";
import { OnlinePaymentsSwitch } from "./paddle-switch";

const EVENTS = "transaction.completed, subscription.created, subscription.updated, subscription.activated, subscription.past_due, subscription.paused, subscription.resumed, subscription.canceled, adjustment.created, adjustment.updated";

/** Settings → Payments: Paddle on/off, setup status, webhook and the latest events. */
export async function PaddleCard({ onlinePayments }: { onlinePayments: boolean }) {
  const { data: events } = await createAdminClient().from("paddle_events").select("id, event_type, received_at, processed_at, error").order("received_at", { ascending: false }).limit(10);
  const env = paddleEnv();
  const api = paddleConfigured();
  const secret = Boolean(process.env.PADDLE_WEBHOOK_SECRET);
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="type-h2 text-ink">Paddle</h2>
          <p className="type-body text-ink-muted">
            Card, Apple Pay, Google Pay and PayPal. Paddle is the Merchant of Record: it charges, adds tax, renews subscriptions and pays you out. Checkout uses each request&apos;s own price, so there is nothing to sync.
          </p>
        </div>
        <span className="flex flex-wrap gap-2">
          <Badge tone={env === "production" ? "success" : "warning"}>{env === "production" ? "Live" : "Sandbox (test)"}</Badge>
          <Badge tone={api ? "success" : "danger"}>{api ? "API key set" : "No API key"}</Badge>
          <Badge tone={secret ? "success" : "danger"}>{secret ? "Webhook secret set" : "No webhook secret"}</Badge>
        </span>
      </div>

      <OnlinePaymentsSwitch initial={onlinePayments} />

      {!api || !secret ? (
        <Alert tone="warning" title="Finish the setup">
          Admin: PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, NEXT_PUBLIC_PADDLE_ENV. Website: PADDLE_API_KEY, NEXT_PUBLIC_PADDLE_CLIENT_TOKEN, NEXT_PUBLIC_PADDLE_ENV. Redeploy after adding them. See docs/PADDLE.md.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <h3 className="type-h3 text-ink">Webhook</h3>
        <p className="type-small text-ink-muted">
          Paddle → Developer tools → Notifications → New destination. URL: <code className="select-all">{adminUrl()}/api/paddle/webhook</code>. Events: {EVENTS}. Copy its secret key
          into PADDLE_WEBHOOK_SECRET. Also set Checkout → Checkout settings → Default payment link to <code className="select-all">https://www.retexia.com/pay</code>.
        </p>
        {events?.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 type-small">
                <span className="font-mono text-ink">{e.event_type}</span>
                <span className="flex items-center gap-2 text-ink-muted">
                  {formatDate(e.received_at, "en-US", true)}
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
