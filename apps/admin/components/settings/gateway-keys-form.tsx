"use client";

import { Badge, Button, Card, Field, Input } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveGatewayKey } from "@/app/(panel)/settings/actions";

const KEYS: { key: string; label: string; hint: string; secret: boolean; placeholder?: string }[] = [
  { key: "openai", label: "OpenAI API key", hint: "Auto comment's AI (the same key Lingo Feeder uses is fine).", secret: true, placeholder: "sk-…" },
  { key: "meta", label: "Retexia's Meta System User token", hint: "Only for sellers on the older partner way. Sellers who connected their own Business portfolio use their own token.", secret: true, placeholder: "EAA…" },
  { key: "tiktok", label: "TikTok Business access token", hint: "Autopublish on TikTok (long-term token).", secret: true },
  { key: "evolution_url", label: "Evolution API URL", hint: "Autopublish's WhatsApp notices. https://…", secret: false, placeholder: "https://evolution.example.com" },
  { key: "evolution_instance", label: "Evolution instance", hint: "The instance name, e.g. retexia-ads.", secret: false },
  { key: "evolution_key", label: "Evolution API key", hint: "", secret: true },
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
        <h2 className="type-h2 text-ink">Feeder tools (n8n gateway)</h2>
        <p className="type-body text-ink-muted">
          The &quot;Retexia — Feeder Autopublish (gateway)&quot; workflow holds no credentials: feeder.retexia.com sends each call the one key it needs from here. Anyone can import the workflow and publish it as it is.
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
