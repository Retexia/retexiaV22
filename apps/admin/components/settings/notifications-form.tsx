"use client";

import { Button, Card, Checkbox, Field, StatusBadge, Textarea, formatDate } from "@retexia/ui";
import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { retryNotification, saveNotificationSettings } from "@/app/(panel)/settings/actions";
import { SaveBar } from "./save-bar";

const CUSTOMER_EVENTS = [
  { key: "order.created", label: "Request received" },
  { key: "order.status_changed", label: "Status changed (when “tell the customer” is ticked)" },
  { key: "payment.confirmed", label: "Payment confirmed (with receipt number)" },
] as const;
const STAFF_EVENTS = [
  { key: "order.created", label: "New request" },
  { key: "contact.created", label: "New contact message" },
  { key: "payment.proof_uploaded", label: "Customer uploaded a payment proof" },
] as const;

type CustomerKey = (typeof CUSTOMER_EVENTS)[number]["key"];
type StaffKey = (typeof STAFF_EVENTS)[number]["key"];
export type NotificationValue = { customer: Record<CustomerKey, { email: boolean; whatsapp: boolean }>; staff_events: StaffKey[]; staff_notification_emails: string };
export type OutboxRow = { id: string; event: string; channel: string; recipient: string | null; status: string; attempts: number; error: string | null; created_at: string; order_ref: string | null };

const tone: Record<string, "warning" | "success" | "danger"> = { pending: "warning", sent: "success", failed: "danger" };

export function NotificationsForm({ initial, outbox, filter, hasWebhook }: { initial: NotificationValue; outbox: OutboxRow[]; filter: string; hasWebhook: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">Customers</h2>
        <p className="type-small text-ink-muted">Messages are queued in the outbox; n8n sends them by email or WhatsApp.</p>
        <table className="w-full type-body">
          <thead>
            <tr className="text-left type-small text-ink-muted">
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 font-medium">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {CUSTOMER_EVENTS.map((e) => (
              <tr key={e.key} className="border-t border-line">
                <td className="py-2.5 pr-4 text-ink">{e.label}</td>
                {(["email", "whatsapp"] as const).map((c) => (
                  <td key={c} className="py-2.5 pr-4">
                    <Checkbox
                      aria-label={`${e.label}: ${c}`}
                      checked={v.customer[e.key][c]}
                      onChange={(x) => setV({ ...v, customer: { ...v.customer, [e.key]: { ...v.customer[e.key], [c]: x.target.checked } } })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">The team</h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 type-label text-ink">Email the team when</legend>
          {STAFF_EVENTS.map((e) => (
            <Checkbox
              key={e.key}
              label={e.label}
              checked={v.staff_events.includes(e.key)}
              onChange={(x) => setV({ ...v, staff_events: x.target.checked ? [...v.staff_events, e.key] : v.staff_events.filter((k) => k !== e.key) })}
            />
          ))}
        </fieldset>
        <Field label="Team emails" hint="Comma separated. Not visible on the website.">
          <Textarea rows={2} value={v.staff_notification_emails} onChange={(e) => setV({ ...v, staff_notification_emails: e.target.value })} placeholder="hello@retexia.com, team@retexia.com" />
        </Field>
      </Card>

      <SaveBar
        dirty={dirty}
        busy={busy}
        onDiscard={() => setV(initial)}
        onSave={async () => {
          setBusy(true);
          const r = await saveNotificationSettings(v);
          setBusy(false);
          toast[r.ok ? "success" : "error"](r.message ?? "");
          if (r.ok) router.refresh();
        }}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="type-h3 text-ink">Outbox</h2>
          <nav aria-label="Outbox filter" className="flex gap-1">
            {["all", "pending", "failed", "sent"].map((f) => (
              <Link
                key={f}
                href={f === "all" ? "/settings/notifications" : `/settings/notifications?status=${f}`}
                aria-current={filter === f ? "page" : undefined}
                className={`inline-flex h-8 items-center rounded-full px-3 type-label ${filter === f ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk"}`}
              >
                {f[0]!.toUpperCase() + f.slice(1)}
              </Link>
            ))}
          </nav>
        </div>
        {!hasWebhook ? <p className="px-5 pt-3 type-small text-warning">No notifications webhook is set (Settings → Integrations), so retries can’t be sent from here.</p> : null}
        {outbox.length ? (
          <ul className="divide-y divide-line">
            {outbox.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <StatusBadge tone={tone[n.status] ?? "neutral"} label={n.status} />
                <span className="type-label text-ink">{n.event}</span>
                <span className="type-small text-ink-muted">
                  {n.channel} → {n.recipient ?? "—"}
                  {n.order_ref ? ` · ${n.order_ref}` : ""} · {n.attempts} attempt{n.attempts === 1 ? "" : "s"}
                </span>
                {n.error ? <span className="type-small text-danger">{n.error}</span> : null}
                <span className="ml-auto flex items-center gap-2 type-small text-ink-muted">
                  {formatDate(n.created_at, "en-LK", true)}
                  {n.status !== "sent" && hasWebhook ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={retrying === n.id}
                      icon={<RotateCw aria-hidden size={14} strokeWidth={1.5} />}
                      onClick={async () => {
                        setRetrying(n.id);
                        const r = await retryNotification({ id: n.id });
                        setRetrying(null);
                        toast[r.ok ? "success" : "error"](r.message ?? "");
                        router.refresh();
                      }}
                    >
                      Retry
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center type-body text-ink-muted">Nothing here.</p>
        )}
      </Card>
    </div>
  );
}
