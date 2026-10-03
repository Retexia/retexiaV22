"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { Alert, Badge, Button, Card, Dialog, Field, Input, formatDate } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { changePassword, logMfaChange, updateOwnProfile } from "@/app/(panel)/account/actions";
import { MfaSetup } from "./mfa";

export function ProfilePanel({ initial, email, role }: { initial: { full_name: string; phone: string }; email: string; role: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="type-h2 text-ink">Your details</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
        </Field>
        <Field label="Phone" optionalLabel="Optional">
          <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <Field label="Email" hint="Ask an owner to change it.">
          <Input value={email} disabled />
        </Field>
        <Field label="Role" hint="Owners change roles in Settings → Team.">
          <Input value={role} disabled />
        </Field>
      </div>
      <Button
        className="self-start"
        size="sm"
        loading={busy}
        disabled={JSON.stringify(v) === JSON.stringify(initial)}
        onClick={async () => {
          setBusy(true);
          const r = await updateOwnProfile(v);
          setBusy(false);
          toast[r.ok ? "success" : "error"](r.message ?? "");
          if (r.ok) router.refresh();
        }}
      >
        Save
      </Button>
    </Card>
  );
}

export function PasswordPanel() {
  const [v, setV] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="type-h2 text-ink">Password</h2>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await changePassword(v);
          setBusy(false);
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            return toast.error(r.message);
          }
          setErrors({});
          setV({ password: "", confirm: "" });
          toast.success(r.message ?? "Changed");
        }}
      >
        <Field label="New password" hint="At least 10 characters, letters and numbers." error={errors.password} required>
          <Input type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
        </Field>
        <Field label="Repeat it" error={errors.confirm} required>
          <Input type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />
        </Field>
        <Button type="submit" size="sm" className="self-start" loading={busy} disabled={!v.password}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

type Factor = { id: string; friendly_name?: string; factor_type: string; status: string; created_at: string };

export function MfaPanel() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [remove, setRemove] = useState<Factor | null>(null);

  const load = useCallback(async () => {
    const { data } = await createBrowserClient().auth.mfa.listFactors();
    setFactors(((data?.all ?? []) as Factor[]).filter((f) => f.status === "verified"));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads factors from the Auth API once
    load();
  }, [load]);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 type-h2 text-ink">
          <ShieldCheck aria-hidden size={20} strokeWidth={1.5} className="text-success" />
          Two-step sign-in
        </h2>
        <Button size="sm" variant="secondary" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setAdding(true)}>
          Add authenticator
        </Button>
      </div>
      <p className="type-small text-ink-muted">Required for the team. Add a second authenticator (for example on a spare phone) so you can’t get locked out.</p>
      {factors === null ? (
        <p className="type-body text-ink-muted">Loading…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {factors.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-2">
                <span className="type-label text-ink">{f.friendly_name || "Authenticator app"}</span>
                <Badge tone="success">Active</Badge>
              </span>
              <span className="flex items-center gap-2 type-small text-ink-muted">
                Added {formatDate(f.created_at)}
                <Button size="sm" variant="ghost" disabled={factors.length < 2} icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemove(f)}>
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {factors && factors.length < 2 ? <Alert tone="info">You can remove an authenticator once you have added another one.</Alert> : null}
      <Dialog
        open={adding}
        onOpenChange={(o) => {
          setAdding(o);
          if (!o) load();
        }}
        title="Add an authenticator"
      >
        {adding ? (
          <MfaSetup
            next="/account"
            onDone={async () => {
              await logMfaChange({ change: "added", name: "Authenticator app" });
              toast.success("Authenticator added");
              setAdding(false);
              load();
            }}
          />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title="Remove this authenticator?"
        description="Codes from it will stop working."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!remove) return;
          const { error } = await createBrowserClient().auth.mfa.unenroll({ factorId: remove.id });
          if (error) toast.error(error.message);
          else {
            await logMfaChange({ change: "removed", name: remove.friendly_name ?? "Authenticator app" });
            toast.success("Removed");
          }
          setRemove(null);
          load();
        }}
      />
    </Card>
  );
}
