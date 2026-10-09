import { Alert, Badge, Card, formatDate } from "@retexia/ui";
import { createAdminClient } from "@retexia/supabase/admin";
import { adminUrl } from "@/lib/env";
import { payhereDashboard, payhereSandbox } from "@/lib/payhere";
import { OnlinePaymentsSwitch } from "./paddle-switch";

/** Settings → Payments: PayHere status, setup and the latest notifications. */
export async function PayhereCard({ onlinePayments }: { onlinePayments: boolean }) {
  const { data: events } = await createAdminClient().from("payhere_events").select("id, message, received_at, processed_at, error").order("received_at", { ascending: false }).limit(10);
  const sandbox = payhereSandbox();
  const merchant = Boolean(process.env.PAYHERE_MERCHANT_ID && process.env.PAYHERE_MERCHANT_SECRET);
  const api = Boolean(process.env.PAYHERE_APP_ID && process.env.PAYHERE_APP_SECRET);
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="type-h2 text-ink">PayHere</h2>
          <p className="type-body text-ink-muted">Customers pay by card in PayHere&apos;s secure window; plans renew automatically. Each checkout uses the request&apos;s own price and setup fee.</p>
        </div>
        <span className="flex flex-wrap gap-2">
          <Badge tone={sandbox ? "warning" : "success"}>{sandbox ? "Sandbox (test)" : "Live"}</Badge>
          <Badge tone={merchant ? "success" : "danger"}>{merchant ? "Merchant ID + secret set" : "No merchant ID / secret"}</Badge>
          <Badge tone={api ? "success" : "warning"}>{api ? "API key set" : "No API key (cancel / check)"}</Badge>
        </span>
      </div>

      <OnlinePaymentsSwitch initial={onlinePayments} />

      {!merchant ? (
        <Alert tone="warning" title="Finish the setup">
          Set PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET, PAYHERE_APP_ID, PAYHERE_APP_SECRET and NEXT_PUBLIC_PAYHERE_SANDBOX in both Vercel projects (website and admin), then redeploy. See docs/PAYHERE.md.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <h3 className="type-h3 text-ink">Notifications</h3>
        <p className="type-small text-ink-muted">
          Sent automatically with every checkout to <code className="select-all">{adminUrl()}/api/payhere/notify</code> (no setup in PayHere needed).{" "}
          <a href={payhereDashboard()} target="_blank" rel="noreferrer" className="text-link">
            Open PayHere
          </a>
        </p>
        {events?.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 type-small">
                <span className="font-mono text-ink">{e.message}</span>
                <span className="flex items-center gap-2 text-ink-muted">
                  {formatDate(e.received_at, "en-US", true)}
                  {e.error ? <Badge tone="danger">{e.error.slice(0, 60)}</Badge> : e.processed_at ? <Badge tone="success">Done</Badge> : <Badge tone="warning">Waiting</Badge>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-small text-ink-muted">No notifications received yet.</p>
        )}
      </div>
    </Card>
  );
}
