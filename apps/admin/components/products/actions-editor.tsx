"use client";

import { Alert, Badge, Button, Card, CheckboxGroup, Field, Input, Select, StatusBadge, Switch, Textarea, formatDate } from "@retexia/ui";
import { ConfirmDialog, SortableList } from "@retexia/ui/admin";
import { KeyRound, Pencil, Plus, Send, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteRow, generateSigningSecret, reorder, saveProductAction, testProductAction } from "@/app/(panel)/products/actions";

export type ProductActionRow = {
  id?: string;
  key: string;
  label: string;
  description: string;
  allowed_statuses: string[];
  min_roles: ("support" | "editor" | "admin" | "owner")[];
  confirm_text: string;
  payload_fields: string[];
  on_success_status: string | null;
  on_success_note: string;
  is_enabled: boolean;
};

export type SecretStatus = { has_webhook: boolean; webhook_host: string | null; has_secret: boolean };
export type RunRow = { id: string; action_label: string | null; status: string; error: string | null; created_at: string; order_ref: string | null };

const ROLE_OPTIONS = [
  { value: "support", label: "Support" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
];

const runTone: Record<string, "success" | "danger" | "warning" | "neutral"> = { succeeded: "success", failed: "danger", running: "warning", queued: "neutral" };

const blank = (): ProductActionRow => ({
  key: "",
  label: "",
  description: "",
  allowed_statuses: [],
  min_roles: ["support", "admin", "owner"],
  confirm_text: "",
  payload_fields: [],
  on_success_status: null,
  on_success_note: "",
  is_enabled: false,
});

const toKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "a_$1").slice(0, 40);

/**
 * Buttons on a request ("Start setup", "Send test message") that call an n8n
 * webhook with a signed request. n8n answers (or calls back) with the result.
 */
export function ActionsEditor({
  productId,
  actions,
  secrets,
  statuses,
  payloadOptions,
  runs,
  callbackUrl,
}: {
  productId: string;
  actions: (ProductActionRow & { id: string })[];
  secrets: Record<string, SecretStatus>;
  statuses: { key: string; label: string }[];
  payloadOptions: { value: string; label: string }[];
  runs: RunRow[];
  callbackUrl: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(actions);
  const [edit, setEdit] = useState<ProductActionRow | null>(null);
  const [webhook, setWebhook] = useState<string | undefined>(undefined);
  const [secret, setSecret] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<(ProductActionRow & { id: string }) | null>(null);
  const statusOptions = statuses.map((s) => ({ value: s.key, label: s.label }));
  const current = edit?.id ? secrets[edit.id] : undefined;

  const open = (a: ProductActionRow) => {
    setEdit(a);
    setWebhook(undefined);
    setSecret(undefined);
    setErrors({});
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await saveProductAction({ ...edit, productId, webhook_url: webhook, signing_secret: secret });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    toast.success(r.message ?? "Saved");
    setEdit(null);
    router.refresh();
  };

  const test = async (id: string) => {
    setTesting(id);
    const r = await testProductAction({ actionId: id });
    setTesting(null);
    setTestResult({ id, ok: r.ok, text: r.ok ? `${r.message}\n${JSON.stringify(r.data?.body ?? null, null, 2)}` : r.message });
    toast[r.ok ? "success" : "error"](r.message ?? "");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl type-body text-ink-muted">
          Each action posts a signed JSON request to an n8n webhook. Requests carry <code className="type-code">X-Retexia-Timestamp</code> and{" "}
          <code className="type-code">X-Retexia-Signature</code> (HMAC-SHA256 of <code className="type-code">timestamp.body</code>). n8n can answer directly or call back{" "}
          <code className="type-code break-all">{callbackUrl}</code>.
        </p>
        <Button size="sm" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => open(blank())}>
          Add action
        </Button>
      </div>

      {edit ? (
        <Card className="flex flex-col gap-5 border-brand/40!">
          <h2 className="type-h3 text-ink">{edit.id ? `Edit ${edit.label}` : "New action"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Button label" error={errors.label} required>
              <Input autoFocus value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value, key: edit.id ? edit.key : toKey(e.target.value) })} placeholder="Start setup" />
            </Field>
            <Field label="Key" hint={edit.id ? "Locked: n8n receives it as event action.<key>." : "n8n receives event action.<key>."} error={errors.key} required>
              <Input className="font-mono" value={edit.key} disabled={Boolean(edit.id)} onChange={(e) => setEdit({ ...edit, key: toKey(e.target.value) })} />
            </Field>
            <Field label="Description" optionalLabel="Optional" className="sm:col-span-2">
              <Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Creates the bot in n8n and connects WhatsApp." />
            </Field>
            <Field label="Available when the request is" labelAs="legend" hint="None ticked = any status.">
              <CheckboxGroup name="allowed_statuses" options={statusOptions} value={edit.allowed_statuses} onChange={(v) => setEdit({ ...edit, allowed_statuses: v })} columns={2} />
            </Field>
            <Field label="Who can run it" labelAs="legend" error={errors.min_roles} required>
              <CheckboxGroup name="min_roles" options={ROLE_OPTIONS} value={edit.min_roles} onChange={(v) => setEdit({ ...edit, min_roles: v as ProductActionRow["min_roles"] })} columns={2} />
            </Field>
            <Field label="Data sent to n8n" labelAs="legend" hint="Pick answers and service fields. None ticked = all of them. Order, customer and package basics are always sent." className="sm:col-span-2">
              <CheckboxGroup name="payload_fields" options={payloadOptions} value={edit.payload_fields} onChange={(v) => setEdit({ ...edit, payload_fields: v })} columns={2} />
            </Field>
            <Field label="Ask before running" hint="Confirmation text. Empty = runs straight away." optionalLabel="Optional" className="sm:col-span-2">
              <Textarea rows={2} value={edit.confirm_text} onChange={(e) => setEdit({ ...edit, confirm_text: e.target.value })} placeholder="This creates the customer's bot. Continue?" />
            </Field>
            <Field label="On success, move request to" optionalLabel="Optional">
              <Select value={edit.on_success_status ?? ""} onChange={(e) => setEdit({ ...edit, on_success_status: e.target.value || null })} options={statusOptions} placeholder="Keep the status" />
            </Field>
            <Field label="On success, note for the customer" optionalLabel="Optional">
              <Input value={edit.on_success_note} onChange={(e) => setEdit({ ...edit, on_success_note: e.target.value })} />
            </Field>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-sunk/60 p-4">
            <h3 className="flex items-center gap-2 type-label text-ink">
              <KeyRound aria-hidden size={16} strokeWidth={1.5} />
              Webhook and signing secret
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="n8n webhook URL" hint={current?.has_webhook && webhook === undefined ? `Saved: ${current.webhook_host}. Type to replace.` : "https://n8n.example.com/webhook/…"} error={errors.webhook_url}>
                <Input type="url" value={webhook ?? ""} onChange={(e) => setWebhook(e.target.value)} placeholder={current?.has_webhook ? `https://${current.webhook_host}/…` : "https://"} />
              </Field>
              <Field label="Signing secret" hint={current?.has_secret && secret === undefined ? "A secret is saved. It is never shown again." : "Paste the same value into n8n to verify requests."}>
                <div className="flex gap-2">
                  <Input value={secret ?? ""} onChange={(e) => setSecret(e.target.value)} placeholder={current?.has_secret ? "••••••••" : ""} className="font-mono" autoComplete="off" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      const s = await generateSigningSecret();
                      setSecret(s);
                      toast.info("New secret generated. Copy it into n8n before saving.");
                    }}
                  >
                    Generate
                  </Button>
                </div>
              </Field>
            </div>
            {secret ? (
              <Alert tone="warning">Copy this secret now. After saving it is stored privately and shown only as “saved”.</Alert>
            ) : null}
          </div>

          <Switch checked={edit.is_enabled} onCheckedChange={(v) => setEdit({ ...edit, is_enabled: v })} label="Enabled" description="Off = the button is hidden on requests." />
          <div className="flex gap-2">
            <Button loading={busy} onClick={save}>
              Save action
            </Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {items.length ? (
        <SortableList
          items={items}
          getId={(a) => a.id}
          getLabel={(a) => a.label}
          className="flex flex-col gap-3"
          onReorder={async (ids) => {
            setItems(ids.map((i) => items.find((a) => a.id === i)!));
            const r = await reorder({ table: "product_actions", ids });
            if (!r.ok) toast.error(r.message);
          }}
          renderItem={(a, handle) => {
            const s = secrets[a.id];
            return (
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {handle}
                  <Zap aria-hidden size={18} strokeWidth={1.5} className="text-ink-muted" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="type-label text-ink">{a.label}</span>
                      <span className="type-code text-ink-muted">action.{a.key}</span>
                      <Badge tone={a.is_enabled ? "success" : "neutral"}>{a.is_enabled ? "Enabled" : "Off"}</Badge>
                      <Badge tone={s?.has_webhook ? "neutral" : "warning"}>{s?.has_webhook ? s.webhook_host : "No webhook"}</Badge>
                      {s?.has_webhook && !s.has_secret ? <Badge tone="warning">Unsigned</Badge> : null}
                    </span>
                    <span className="type-small text-ink-muted">
                      {a.allowed_statuses.length ? `When ${a.allowed_statuses.map((k) => statuses.find((x) => x.key === k)?.label ?? k).join(", ")}` : "Any status"} · {a.min_roles.join(", ")}
                    </span>
                  </div>
                  <Button size="sm" variant="secondary" loading={testing === a.id} disabled={!s?.has_webhook} icon={<Send aria-hidden size={14} strokeWidth={1.5} />} onClick={() => test(a.id)}>
                    Send test
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => open(a)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemove(a)}>
                    <span className="sr-only">Delete {a.label}</span>
                  </Button>
                </div>
                {testResult?.id === a.id ? (
                  <pre className={`max-h-64 overflow-auto rounded-md p-3 type-code ${testResult.ok ? "bg-success-soft text-ink" : "bg-danger-soft text-ink"}`}>{testResult.text}</pre>
                ) : null}
              </Card>
            );
          }}
        />
      ) : edit ? null : (
        <Card>
          <p className="type-body text-ink-muted">No actions yet. Add one to trigger an n8n workflow from a request.</p>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">Recent runs</h2>
        {runs.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={runTone[r.status] ?? "neutral"} label={r.status} />
                  <span className="type-label text-ink">{r.action_label}</span>
                  {r.order_ref ? (
                    <Link href={`/requests/${encodeURIComponent(r.order_ref)}?tab=setup`} className="type-code text-link">
                      {r.order_ref}
                    </Link>
                  ) : null}
                  {r.error ? <span className="type-small text-danger">{r.error}</span> : null}
                </span>
                <span className="type-small text-ink-muted">{formatDate(r.created_at, "en-LK", true)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body text-ink-muted">No runs yet.</p>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title={`Delete “${remove?.label}”?`}
        description="The button disappears from requests. Past runs stay in the history."
        confirmLabel="Delete action"
        onConfirm={async () => {
          if (!remove) return;
          const r = await deleteRow({ table: "product_actions", id: remove.id });
          toast[r.ok ? "success" : "error"](r.ok ? "Action deleted" : r.message);
          setRemove(null);
          if (r.ok) {
            setItems(items.filter((i) => i.id !== remove.id));
            router.refresh();
          }
        }}
      />
    </div>
  );
}
