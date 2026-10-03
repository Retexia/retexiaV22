"use client";

import { Alert, Badge, Button, Card, Field, Input, Select, StatusBadge, Switch, Textarea, formatDate } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { CircleCheck, CircleDashed, Eye, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { revealSecret, runProductAction, saveServiceData } from "@/app/(panel)/requests/actions";
import { label } from "@/components/common/status";

export type ServiceField = {
  key: string;
  label: string;
  type: string;
  options: { value: string; label: string }[];
  help_text: string | null;
  visible_to_customer: boolean;
  required_for_status: string | null;
};

export type ProductAction = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  allowed_statuses: string[];
  min_roles: string[];
  confirm_text: string | null;
  is_enabled: boolean;
};

export type ActionRun = {
  id: string;
  action_label: string | null;
  status: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

const runTone = { queued: "neutral", running: "brand", succeeded: "success", failed: "danger" } as const;

/** Product setup fields for one request, the go-live checklist and the n8n action buttons. */
export function ServiceSetup({
  orderId,
  orderRef,
  status,
  role,
  canOperate,
  canReveal,
  fields,
  values,
  secrets,
  statusLabels,
  actions,
  runs,
}: {
  orderId: string;
  orderRef: string;
  status: string;
  role: string;
  canOperate: boolean;
  canReveal: boolean;
  fields: ServiceField[];
  values: Record<string, unknown>;
  secrets: Record<string, string>;
  statusLabels: Record<string, string>;
  actions: ProductAction[];
  runs: ActionRun[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const d: Record<string, unknown> = {};
    for (const f of fields) if (f.type !== "secret") d[f.key] = values[f.key] ?? (f.type === "toggle" ? false : "");
    return d;
  });
  const [secretDraft, setSecretDraft] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ProductAction | null>(null);

  const dirty =
    Object.keys(secretDraft).some((k) => secretDraft[k]) ||
    fields.some((f) => f.type !== "secret" && String(draft[f.key] ?? "") !== String(values[f.key] ?? (f.type === "toggle" ? false : "")));

  const filled = (f: ServiceField) =>
    f.type === "secret" ? Boolean(secrets[f.key]) : values[f.key] !== undefined && values[f.key] !== null && String(values[f.key]).trim() !== "";

  const required = fields.filter((f) => f.required_for_status);
  const set = (key: string, v: unknown) => setDraft((d) => ({ ...d, [key]: v }));

  async function save() {
    setSaving(true);
    const changes: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "secret") {
        if (secretDraft[f.key]) changes[f.key] = secretDraft[f.key];
      } else if (String(draft[f.key] ?? "") !== String(values[f.key] ?? "")) {
        changes[f.key] = f.type === "number" && draft[f.key] !== "" ? Number(draft[f.key]) : draft[f.key];
      }
    }
    const r = await saveServiceData({ orderId, ref: orderRef, values: changes });
    setSaving(false);
    toast[r.ok ? "success" : "error"](r.message ?? "");
    if (r.ok) {
      setSecretDraft({});
      router.refresh();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="type-h2 text-ink">Setup fields</h2>
          <p className="type-body text-ink-muted">Values the product needs to run for this customer. Secrets are stored privately and shown masked.</p>
        </div>
        {fields.length ? (
          <form
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-col gap-5"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              {fields.map((f) => {
                const hint = [f.help_text, f.visible_to_customer ? "Shown to the customer." : null, f.required_for_status ? `Needed before “${statusLabels[f.required_for_status] ?? label(f.required_for_status)}”.` : null]
                  .filter(Boolean)
                  .join(" ");
                const wide = f.type === "textarea";
                if (f.type === "toggle") {
                  return (
                    <div key={f.key} className="sm:col-span-2">
                      <Switch checked={draft[f.key] === true} onCheckedChange={(v) => set(f.key, v)} label={f.label} description={hint || undefined} disabled={!canOperate} />
                    </div>
                  );
                }
                if (f.type === "secret") {
                  return (
                    <Field key={f.key} label={f.label} hint={hint || undefined} optionalLabel="" className="sm:col-span-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <span className="type-code text-ink-muted">{revealed[f.key] ?? secrets[f.key] ?? "Not set"}</span>
                        {secrets[f.key] && canReveal && !revealed[f.key] ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Eye aria-hidden size={14} strokeWidth={1.5} />}
                            onClick={async () => {
                              const r = await revealSecret({ orderId, key: f.key });
                              if (r.ok) setRevealed((x) => ({ ...x, [f.key]: r.data ?? "" }));
                              else toast.error(r.message);
                            }}
                          >
                            Reveal
                          </Button>
                        ) : null}
                        {canOperate ? (
                          <Input
                            type="password"
                            autoComplete="off"
                            placeholder={secrets[f.key] ? "Type to replace" : "Paste the value"}
                            value={secretDraft[f.key] ?? ""}
                            onChange={(e) => setSecretDraft((s) => ({ ...s, [f.key]: e.target.value }))}
                            className="sm:max-w-[320px]"
                          />
                        ) : null}
                      </div>
                    </Field>
                  );
                }
                return (
                  <Field key={f.key} label={f.label} hint={hint || undefined} optionalLabel="" className={wide ? "sm:col-span-2" : undefined}>
                    {f.type === "textarea" ? (
                      <Textarea rows={3} value={String(draft[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} disabled={!canOperate} />
                    ) : f.type === "select" ? (
                      <Select value={String(draft[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} options={f.options} disabled={!canOperate} />
                    ) : (
                      <Input
                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                        value={String(draft[f.key] ?? "")}
                        onChange={(e) => set(f.key, e.target.value)}
                        disabled={!canOperate}
                      />
                    )}
                  </Field>
                );
              })}
            </div>
            {canOperate ? (
              <div className="flex justify-end border-t border-line pt-4">
                <Button type="submit" loading={saving} disabled={!dirty}>
                  Save setup fields
                </Button>
              </div>
            ) : null}
          </form>
        ) : (
          <p className="type-body text-ink-muted">This product has no setup fields. Add them under Products → Service fields.</p>
        )}
      </Card>

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <h2 className="type-h2 text-ink">Ready to go live</h2>
          {required.length ? (
            <ul className="flex flex-col gap-2">
              {required.map((f) => (
                <li key={f.key} className="flex items-start gap-2 type-body">
                  {filled(f) ? (
                    <CircleCheck aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" />
                  ) : (
                    <CircleDashed aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-muted" />
                  )}
                  <span>
                    {f.label}
                    <span className="sr-only">{filled(f) ? " (done)" : " (missing)"}</span>
                    <span className="block type-small text-ink-muted">Before “{statusLabels[f.required_for_status!] ?? label(f.required_for_status)}”</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="type-body text-ink-muted">No fields are required before a status change.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="type-h2 text-ink">Product actions</h2>
          {actions.length ? (
            <ul className="flex flex-col gap-3">
              {actions.map((a) => {
                const statusOk = !a.allowed_statuses.length || a.allowed_statuses.includes(status);
                const roleOk = a.min_roles.includes(role);
                const reason = !a.is_enabled
                  ? "Switched off. Save a webhook URL and enable it under Products → Actions."
                  : !statusOk
                    ? `Available when the request is ${a.allowed_statuses.map((s) => statusLabels[s] ?? label(s)).join(" or ")}.`
                    : !roleOk
                      ? "Your role can't run this."
                      : null;
                return (
                  <li key={a.id} className="flex flex-col gap-2 rounded-md border border-line p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="type-label text-ink">{a.label}</span>
                        {a.description ? <span className="type-small text-ink-muted">{a.description}</span> : null}
                      </div>
                      <Button size="sm" disabled={Boolean(reason)} icon={<Play aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setConfirm(a)}>
                        Run
                      </Button>
                    </div>
                    {reason ? <p className="type-small text-ink-muted">{reason}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="type-body text-ink-muted">No actions for this product yet.</p>
          )}
          {runs.length ? (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <h3 className="type-h3 text-ink">Recent runs</h3>
              <ul className="flex flex-col gap-2">
                {runs.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <StatusBadge tone={runTone[r.status as keyof typeof runTone] ?? "neutral"} label={label(r.status)} />
                      <span className="type-small text-ink">{r.action_label}</span>
                    </span>
                    <span className="type-small text-ink-muted">{formatDate(r.created_at, "en-LK", true)}</span>
                    {r.error ? <span className="type-small text-danger">{r.error}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
        {Object.keys(secrets).length ? <Badge tone="neutral">{Object.keys(secrets).length} secret(s) stored privately</Badge> : null}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        danger={false}
        title={confirm ? `${confirm.label}?` : ""}
        description={confirm?.confirm_text ?? "This calls the product's n8n workflow for this request."}
        confirmLabel="Run now"
        onConfirm={async () => {
          if (!confirm) return;
          const r = await runProductAction({ orderId, ref: orderRef, actionId: confirm.id });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          setConfirm(null);
          router.refresh();
        }}
      >
        {dirty ? <Alert tone="warning">You have unsaved setup fields. Save them first if the workflow needs them.</Alert> : null}
      </ConfirmDialog>
    </div>
  );
}
