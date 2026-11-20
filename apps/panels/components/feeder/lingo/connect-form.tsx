"use client";

import { Badge, Button, Card, Field, Input } from "@retexia/ui";
import { CheckCircle2, CircleDashed, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { checkNumber, removeNumber, saveNumber } from "@/app/feeder/(app)/lingo/actions";
import type { WaNumber } from "@/lib/feeder/lingo/data";
import { timeAgo } from "@/lib/feeder/lingo/labels";
import { useAction } from "./common";

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="secondary" aria-label={`Copy ${label}`} onClick={async () => { await navigator.clipboard.writeText(value); toast.success("Copied"); }}>
          <Copy aria-hidden size={16} strokeWidth={1.75} />
        </Button>
      </div>
    </Field>
  );
}

function Step({ n, done, title, children }: { n: number; done?: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full type-small ${done ? "bg-success text-on-brand" : "bg-surface-sunk text-ink-muted"}`}>{done ? "✓" : n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="type-label text-ink">{title}</p>
        <div className="type-small text-ink-muted">{children}</div>
      </div>
    </li>
  );
}

export function ConnectForm({ number, webhookUrl }: { number: WaNumber | null; webhookUrl: string | null }) {
  const [v, setV] = useState({ phone_number_id: number?.phone_number_id ?? "", waba_id: number?.waba_id ?? "", token: "", app_secret: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, go } = useAction();
  const connected = number?.status === "connected";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex flex-col gap-5">
        <h2 className="type-h3 text-ink">Connect your number (about 15 minutes)</h2>
        <ol className="flex flex-col gap-4">
          <Step n={1} title="Create a Meta Business app">
            At developers.facebook.com → My Apps → Create app → type <strong>Business</strong>, linked to your Meta Business portfolio.
          </Step>
          <Step n={2} title="Add WhatsApp">
            In the app, add the <strong>WhatsApp</strong> product and connect your WhatsApp Business Account and phone number. Add a payment method in WhatsApp Manager (Meta asks for it; chats from your ads are free).
          </Step>
          <Step n={3} title="Make a permanent token">
            Business settings → Users → System users → Add (Admin) → Assign assets: your app and your WhatsApp account (full control) → Generate token with <strong>whatsapp_business_messaging</strong> and <strong>whatsapp_business_management</strong>, never expiring.
          </Step>
          <Step n={4} done={Boolean(number)} title="Paste the IDs, the token and the App secret">
            <form
              className="mt-2 flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await go(() => saveNumber(v));
                setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
                if (r.ok) setV({ ...v, token: "", app_secret: "" });
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Phone number ID" hint="WhatsApp → API Setup" error={errors.phone_number_id}>
                  <Input value={v.phone_number_id} onChange={(e) => setV({ ...v, phone_number_id: e.target.value })} inputMode="numeric" autoComplete="off" />
                </Field>
                <Field label="WhatsApp Business Account ID" hint="Same page" error={errors.waba_id}>
                  <Input value={v.waba_id} onChange={(e) => setV({ ...v, waba_id: e.target.value })} inputMode="numeric" autoComplete="off" />
                </Field>
              </div>
              <Field label="Permanent token" hint={number?.token_last4 ? `Saved, ends in …${number.token_last4}. Paste a new one only to replace it.` : "Starts with EA…"} error={errors.token}>
                <Input type="password" value={v.token} onChange={(e) => setV({ ...v, token: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="App secret" hint={number ? "Saved. Paste it again only if you reset it in Meta." : "App settings → Basic → App secret (Show). Lingo uses it to check every message really comes from Meta."} error={errors.app_secret}>
                <Input type="password" value={v.app_secret} onChange={(e) => setV({ ...v, app_secret: e.target.value })} autoComplete="off" />
              </Field>
              <p className="type-small text-ink-muted">Kept encrypted in Retexia&apos;s vault; nobody can see them again, not even you.</p>
              <Button type="submit" disabled={pending} className="self-start">{number ? "Save changes" : "Save"}</Button>
            </form>
          </Step>
          <Step n={5} done={connected} title="Test the connection">
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button size="sm" variant={connected ? "secondary" : "primary"} disabled={pending || !number} onClick={() => go(() => checkNumber())}>Test connection</Button>
              {number?.last_check_at ? <span>Last checked {timeAgo(number.last_check_at)}</span> : null}
            </div>
            {number?.problem ? <p className="mt-1 text-danger">{number.problem}</p> : null}
          </Step>
          <Step n={6} done={Boolean(number?.last_webhook_at)} title="Send WhatsApp messages to Lingo">
            In your app: WhatsApp → Configuration → Webhook → Edit. Paste the Callback URL and Verify token below, press <strong>Verify and save</strong>, then <strong>Subscribe</strong> to <strong>messages</strong> (and <strong>smb_message_echoes</strong> if you also reply from the WhatsApp Business app).
            {webhookUrl && number ? (
              <div className="mt-2 flex flex-col gap-2">
                <CopyField label="Callback URL" value={webhookUrl} />
                <CopyField label="Verify token" value={number.verify_token} />
              </div>
            ) : (
              <p className="mt-1">{number ? "Retexia is finishing the setup of Lingo's address; it shows here soon." : "Save your number first."}</p>
            )}
          </Step>
          <Step n={7} done={Boolean(number?.last_webhook_at)} title="Send a test message">
            From another phone, send your number a WhatsApp message.{" "}
            {number?.last_webhook_at ? (
              <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 aria-hidden size={14} strokeWidth={1.75} /> Lingo got a message {timeAgo(number.last_webhook_at)}.</span>
            ) : (
              <span className="inline-flex items-center gap-1"><CircleDashed aria-hidden size={14} strokeWidth={1.75} /> Waiting for the first message… (reload this page). If it doesn&apos;t arrive, check the App secret and the subscription to messages.</span>
            )}
          </Step>
        </ol>
      </Card>
      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2">
          <h2 className="type-h3 text-ink">Your number</h2>
          {number ? (
            <>
              <p className="flex flex-wrap items-center gap-2 type-body text-ink">
                {number.display_phone || number.phone_number_id}
                <Badge tone={connected ? "success" : number.status === "problem" ? "danger" : "warning"}>{connected ? "Connected" : number.status === "problem" ? "Problem" : "Not tested"}</Badge>
              </p>
              {number.verified_name ? <p className="type-small text-ink-muted">{number.verified_name}</p> : null}
              {number.quality_rating ? <p className="type-small text-ink-muted">Quality rating: {number.quality_rating}</p> : null}
              <p className="type-small text-ink-muted">Last message received: {timeAgo(number.last_webhook_at)}</p>
              <Button size="sm" variant="ghost" className="self-start" disabled={pending} onClick={() => { if (confirm("Remove this number? Lingo stops answering on it and its token is deleted.")) void go(() => removeNumber()); }}>Remove number</Button>
            </>
          ) : (
            <p className="type-small text-ink-muted">Not connected yet.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-2">
          <h2 className="type-h3 text-ink">One-click connect</h2>
          <p className="type-small text-ink-muted">A &quot;Connect WhatsApp&quot; button (Meta&apos;s Embedded Signup, also for numbers already on the WhatsApp Business app) comes once Retexia&apos;s Meta Tech Provider approval is done. Numbers connected now keep working.</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <h2 className="type-h3 text-ink">Good to know</h2>
          <ul className="flex list-disc flex-col gap-1 pl-4 type-small text-ink-muted">
            <li>WhatsApp fees, if any, are charged by Meta to your own account. Chats from Click-to-WhatsApp ads are free, and so are the first 1,000 service messages a month.</li>
            <li>Meta&apos;s Commerce Policy applies to what you sell on WhatsApp, including health products.</li>
            <li>Lingo never sends marketing templates; it only replies inside WhatsApp&apos;s 24-hour window.</li>
          </ul>
        </Card>
      </aside>
    </div>
  );
}
