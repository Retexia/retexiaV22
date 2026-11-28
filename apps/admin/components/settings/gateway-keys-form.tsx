"use client";

import { Badge, Button, Card, Field, Input } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveGatewayKey } from "@/app/(panel)/settings/actions";

const KEYS: { key: string; label: string; hint: string; secret: boolean; placeholder?: string }[] = [
  { key: "meta", label: "Retexia's Meta System User token", hint: "Only for sellers on the older partner way (shared with Retexia's business). Sellers who connected their own Business portfolio use their own token.", secret: true, placeholder: "EAA…" },
  { key: "tiktok", label: "Retexia's TikTok access token", hint: "Only for sellers who shared their advertiser with Retexia's Business Center. Sellers with their own TikTok token (Connections) use theirs.", secret: true },
];

/** Settings → Integrations: the keys the Feeder n8n gateway uses (kept in Vault; the workflow itself holds none). */
export function GatewayKeysForm({ saved }: { saved: Record<string, string> }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const save = (key: string, value: string) =>
    start(async () => {
      const r = await saveGatewayKey({ key, value });
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        setValues((v) => ({ ...v, [key]: "" }));
        router.refresh();
      } else toast.error(r.message);
    });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-h2 text-ink">Feeder tools: Retexia&apos;s Meta and TikTok tokens</h2>
        <p className="type-body text-ink-muted">
          Meta and TikTok tokens depend on the customer, so the n8n gateway doesn&apos;t keep them: feeder.retexia.com sends the right one with each call. These two are Retexia&apos;s own, for sellers who share their accounts with Retexia. OpenAI and Evolution stay as n8n credentials.
        </p>
      </div>
      {KEYS.map((k) => (
        <div key={k.key} className="flex flex-col gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
          <Field label={k.label} hint={k.hint || undefined} optionalLabel="">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-0 flex-1"
                type={k.secret ? "password" : "text"}
                autoComplete="off"
                value={values[k.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [k.key]: e.target.value }))}
                placeholder={saved[k.key] ? (k.secret ? `Saved (${saved[k.key]}). Paste a new one to replace it.` : saved[k.key]) : (k.placeholder ?? "")}
              />
              <Button size="sm" disabled={pending || !(values[k.key] ?? "").trim()} onClick={() => save(k.key, values[k.key] ?? "")}>
                Save
              </Button>
              {saved[k.key] ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => window.confirm(`Remove the ${k.label}?`) && save(k.key, "")}>
                  Remove
                </Button>
              ) : null}
            </div>
          </Field>
          {saved[k.key] ? <Badge tone="success" className="self-start">Saved</Badge> : <Badge tone="neutral" className="self-start">Not set</Badge>}
        </div>
      ))}
    </Card>
  );
}
