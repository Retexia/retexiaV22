"use client";

import { Badge, Button, Field, Select } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { NewLingoAccountForm } from "./account-form";
import { linkLingoAccount, unlinkLingoAccount } from "./actions";

export type LingoAccount = { id: number; business_name: string; evolution_instance: string; owner_phone: string | null; active: boolean };


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
              <a href={`/products/lingo/accounts/${a.id}`} className="type-body text-ink underline-offset-4 hover:underline">
                {a.business_name} <span className="text-ink-muted">#{a.id}</span>
              </a>
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
          <NewLingoAccountForm
            orderId={orderId}
            defaults={defaults}
            onCancel={() => setCreating(false)}
            onDone={() => {
              setCreating(false);
              router.refresh();
            }}
          />
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
