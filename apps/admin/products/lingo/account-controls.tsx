"use client";

import { Badge, Button, Field, Input, Select } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createLingoAccount, linkLingoAccount, unlinkLingoAccount } from "./actions";

export type LingoAccount = { id: number; business_name: string; evolution_instance: string; owner_phone: string | null; active: boolean };

const LANGS = [
  { value: "singlish", label: "Singlish" },
  { value: "si", label: "Sinhala" },
  { value: "en", label: "English" },
  { value: "ta", label: "Tamil" },
];

export function LingoAccountControls({
  orderId,
  role,
  linked,
  available,
  defaults,
}: {
  orderId: string;
  role: string;
  linked: LingoAccount[];
  available: LingoAccount[];
  defaults: { business_name: string; owner_phone: string };
}) {
  const router = useRouter();
  const isAdmin = role === "admin" || role === "owner";
  const [pick, setPick] = useState(available[0] ? String(available[0].id) : "");
  const [busy, setBusy] = useState(false);
  const [unlink, setUnlink] = useState<LingoAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ business_name: defaults.business_name, evolution_instance: "", evolution_base_url: "", evolution_apikey: "", owner_phone: defaults.owner_phone, default_language: "singlish" as "singlish" | "si" | "en" | "ta" });

  const done = (r: { ok: boolean; message?: string }) => {
    if (r.ok) {
      toast.success(r.message ?? "Done");
      router.refresh();
    } else toast.error(r.message ?? "Something went wrong");
  };

  if (linked.length) {
    return (
      <div className="flex flex-col gap-3">
        {linked.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
            <div>
              <p className="type-body text-ink">
                {a.business_name} <span className="text-ink-muted">#{a.id}</span>
              </p>
              <p className="type-small text-ink-muted">
                WhatsApp instance {a.evolution_instance}
                {a.owner_phone ? ` · owner ${a.owner_phone}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={a.active ? "success" : "neutral"}>{a.active ? "Bot on" : "Bot off"}</Badge>
              {isAdmin ? (
                <Button size="sm" variant="secondary" onClick={() => setUnlink(a)}>
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        <p className="type-small text-ink-muted">Connected: the customer sees this bot on lingo.retexia.com.</p>
        <ConfirmDialog
          open={Boolean(unlink)}
          onOpenChange={(o) => !o && setUnlink(null)}
          title="Disconnect this bot?"
          description="The customer will no longer see it in their Lingo panel. The bot itself keeps running."
          confirmLabel="Disconnect"
          danger
          onConfirm={async () => {
            if (unlink) done(await unlinkLingoAccount({ orderId, accountId: unlink.id }));
            setUnlink(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="type-body text-ink-muted">Not connected yet: the customer&apos;s panel says &ldquo;almost ready&rdquo; until you connect their bot here.</p>

      {available.length ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Existing bot account" optionalLabel="" className="min-w-64 flex-1">
            <Select value={pick} onChange={(e) => setPick(e.target.value)} options={available.map((a) => ({ value: String(a.id), label: `${a.business_name} (#${a.id}, ${a.evolution_instance})` }))} />
          </Field>
          <Button
            loading={busy}
            disabled={!pick}
            onClick={async () => {
              setBusy(true);
              done(await linkLingoAccount({ orderId, accountId: Number(pick) }));
              setBusy(false);
            }}
          >
            Connect
          </Button>
        </div>
      ) : (
        <p className="type-small text-ink-muted">There are no unconnected bot accounts. Create one below.</p>
      )}

      {isAdmin ? (
        creating ? (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const r = await createLingoAccount({ orderId, ...form });
              setBusy(false);
              done(r);
              if (r.ok) setCreating(false);
            }}
          >
            <Field label="Business name" optionalLabel="">
              <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required />
            </Field>
            <Field label="Owner's WhatsApp (alerts)" hint="With country code, e.g. 94771234567">
              <Input value={form.owner_phone} inputMode="numeric" onChange={(e) => setForm({ ...form, owner_phone: e.target.value })} />
            </Field>
            <Field label="Evolution instance name" optionalLabel="">
              <Input value={form.evolution_instance} onChange={(e) => setForm({ ...form, evolution_instance: e.target.value })} required />
            </Field>
            <Field label="Evolution API address" optionalLabel="">
              <Input type="url" placeholder="https://evo.example.com" value={form.evolution_base_url} onChange={(e) => setForm({ ...form, evolution_base_url: e.target.value })} required />
            </Field>
            <Field label="Instance API key" hint="Stored for the bot only; never shown to the customer." optionalLabel="">
              <Input type="password" autoComplete="off" value={form.evolution_apikey} onChange={(e) => setForm({ ...form, evolution_apikey: e.target.value })} required />
            </Field>
            <Field label="Bot language" optionalLabel="">
              <Select value={form.default_language} onChange={(e) => setForm({ ...form, default_language: e.target.value as typeof form.default_language })} options={LANGS} />
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={busy}>
                Create and connect
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setCreating(true)}>
              New bot account
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
