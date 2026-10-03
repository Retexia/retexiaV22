"use client";

import { Alert, Button, Card, Field, Input } from "@retexia/ui";
import { ConfirmDialog, DescriptionList } from "@retexia/ui/admin";
import { Copy, KeyRound, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveIntegrations, testNotificationsWebhook } from "@/app/(panel)/settings/actions";

export type IntegrationStatus = { has_callback_secret: boolean; callback_secret_hint: string | null; notifications_webhook_url: string | null; updated_at: string | null };

const copy = async (text: string) => {
  await navigator.clipboard.writeText(text);
  toast.success("Copied");
};

export function IntegrationsForm({ status, callbackUrl }: { status: IntegrationStatus; callbackUrl: string }) {
  const router = useRouter();
  const [webhook, setWebhook] = useState(status.notifications_webhook_url ?? "");
  const [secret, setSecret] = useState<string | null>(null);
  const [rotate, setRotate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">n8n callback</h2>
        <p className="type-body text-ink-muted">n8n reports product action results and notification deliveries here. Every request must be signed with the callback secret.</p>
        <DescriptionList
          items={[
            {
              label: "Callback URL",
              value: (
                <span className="flex items-center gap-2">
                  <code className="type-code break-all">{callbackUrl}</code>
                  <Button size="sm" variant="ghost" icon={<Copy aria-hidden size={14} strokeWidth={1.5} />} onClick={() => copy(callbackUrl)}>
                    <span className="sr-only">Copy callback URL</span>
                  </Button>
                </span>
              ),
            },
            { label: "Callback secret", value: status.has_callback_secret ? `Saved (${status.callback_secret_hint})` : "Not set: callbacks are refused" },
          ]}
        />
        {secret ? (
          <Alert tone="warning" title="Copy this secret now">
            <span className="flex flex-wrap items-center gap-2">
              <code className="type-code break-all">{secret}</code>
              <Button size="sm" variant="secondary" icon={<Copy aria-hidden size={14} strokeWidth={1.5} />} onClick={() => copy(secret)}>
                Copy
              </Button>
            </span>
            <span className="mt-1 block">It is stored privately and won’t be shown again. Paste it into the n8n credential that signs callbacks.</span>
          </Alert>
        ) : null}
        <Button variant="secondary" className="self-start" icon={<KeyRound aria-hidden size={16} strokeWidth={1.5} />} onClick={() => setRotate(true)}>
          {status.has_callback_secret ? "Rotate secret" : "Generate secret"}
        </Button>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="type-h2 text-ink">Notifications webhook</h2>
        <p className="type-body text-ink-muted">
          Used for “Retry” in the outbox and the test below. New notifications reach n8n through a Supabase Database Webhook on <code className="type-code">notifications_outbox</code> inserts (see docs/DEPLOY.md).
        </p>
        <Field label="n8n webhook URL" hint="https://n8n.example.com/webhook/retexia-notifications">
          <Input type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            loading={busy === "save"}
            disabled={webhook === (status.notifications_webhook_url ?? "")}
            onClick={async () => {
              setBusy("save");
              const r = await saveIntegrations({ notifications_webhook_url: webhook });
              setBusy(null);
              toast[r.ok ? "success" : "error"](r.message ?? "");
              if (r.ok) router.refresh();
            }}
          >
            Save
          </Button>
          <Button
            variant="secondary"
            loading={busy === "test"}
            disabled={!status.notifications_webhook_url}
            icon={<Send aria-hidden size={14} strokeWidth={1.5} />}
            onClick={async () => {
              setBusy("test");
              const r = await testNotificationsWebhook();
              setBusy(null);
              toast[r.ok ? "success" : "error"](r.message ?? "");
            }}
          >
            Test connection
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h2 text-ink">Verifying requests in n8n</h2>
        <p className="type-small text-ink-muted">Requests from Retexia carry the same signature. In an n8n Code node:</p>
        <pre className="overflow-x-auto rounded-md bg-surface-sunk p-4 type-code text-ink">{`const crypto = require('crypto');
const ts = $input.first().json.headers['x-retexia-timestamp'];
const sig = $input.first().json.headers['x-retexia-signature'];
const body = JSON.stringify($input.first().json.body);
const expected = crypto.createHmac('sha256', $env.RETEXIA_SECRET).update(ts + '.' + body).digest('hex');
if (sig !== expected || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new Error('Bad signature');
return $input.all();`}</pre>
        <p className="type-small text-ink-muted">Use “Raw body” on the Webhook node if your n8n version re-formats JSON, and sign the raw text instead.</p>
      </Card>

      <ConfirmDialog
        open={rotate}
        onOpenChange={setRotate}
        danger={status.has_callback_secret}
        title={status.has_callback_secret ? "Rotate the callback secret?" : "Generate a callback secret?"}
        description={status.has_callback_secret ? "n8n callbacks signed with the old secret are refused straight away. Update n8n right after." : "You'll see it once, then it's stored privately."}
        confirmLabel={status.has_callback_secret ? "Rotate" : "Generate"}
        onConfirm={async () => {
          setRotate(false);
          const r = await saveIntegrations({ rotateSecret: true });
          if (!r.ok) {
            toast.error(r.message);
            return;
          }
          setSecret(r.data ?? null);
          toast.success(r.message ?? "Done");
          router.refresh();
        }}
      />
    </div>
  );
}
