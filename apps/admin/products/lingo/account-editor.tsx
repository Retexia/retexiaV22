"use client";

import { Button, Card, Field, Input, Select, Switch } from "@retexia/ui";
import { ConfirmDialog } from "@retexia/ui/admin";
import { PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CustomerPicker } from "@/components/common/customer-picker";
import type { CustomerOption } from "@/app/(panel)/customers/actions";
import { LANGS } from "./account-form";
import { checkLingoConnection, saveLingoAccount, saveLingoConnection, setLingoActive, setLingoOwner } from "./actions";
import type { LingoAccountRow, LingoOwner } from "./data";

type Lang = "singlish" | "si" | "en" | "ta";

function useResult() {
  const router = useRouter();
  return (r: { ok: boolean; message?: string }) => {
    if (r.ok) {
      toast.success(r.message ?? "Saved");
      router.refresh();
    } else toast.error(r.message ?? "Something went wrong");
    return r.ok;
  };
}

/** Bot on/off and its owner (the Retexia customer who sees it on lingo.retexia.com). */
export function LingoOwnerCard({ account, owner, canAdmin }: { account: LingoAccountRow; owner: LingoOwner | null; canAdmin: boolean }) {
  const result = useResult();
  const [pick, setPick] = useState<CustomerOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <Card className="flex flex-col gap-5">
      <Switch
        checked={account.active}
        onCheckedChange={async (active) => result(await setLingoActive({ id: account.id, active }))}
        label="Bot is answering"
        description="Off: Lingo reads nothing and answers nobody on this number. The customer can also switch this in their panel."
      />
      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <h2 className="type-h3 text-ink">Customer</h2>
        {owner ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <a href={`/customers/${owner.id}`} className="type-body text-ink underline-offset-4 hover:underline">
                {owner.name}
              </a>
              <p className="type-small text-ink-muted">
                {owner.email}
                {owner.orderRef ? (
                  <>
                    {" · "}
                    <a href={`/requests/${encodeURIComponent(owner.orderRef)}`} className="hover:underline">
                      {owner.orderRef}
                    </a>
                  </>
                ) : (
                  " · no Lingo request"
                )}
              </p>
            </div>
            {canAdmin ? (
              <Button size="sm" variant="secondary" onClick={() => setConfirm(true)}>
                Disconnect
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <p className="type-small text-ink-muted">Not connected: no customer sees this bot. Pick the customer who owns this WhatsApp number.</p>
            <CustomerPicker value={pick} onChange={setPick} canInvite={false} />
            <div>
              <Button
                disabled={!pick}
                loading={busy}
                onClick={async () => {
                  if (!pick) return;
                  setBusy(true);
                  result(await setLingoOwner({ accountId: account.id, userId: pick.id }));
                  setBusy(false);
                }}
              >
                Connect to this customer
              </Button>
            </div>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect this customer?"
        description="They will no longer see this bot in their Lingo panel. The bot keeps running."
        confirmLabel="Disconnect"
        danger
        onConfirm={async () => {
          result(await setLingoOwner({ accountId: account.id, userId: null }));
          setConfirm(false);
        }}
      />
    </Card>
  );
}

export function LingoSettingsCard({ account }: { account: LingoAccountRow }) {
  const result = useResult();
  const initial = {
    business_name: account.business_name,
    staff_name: account.staff_name ?? "",
    owner_phone: account.owner_phone ?? "",
    default_language: account.default_language as Lang,
    content_language: account.content_language as Lang,
    followup_hours: account.followup_hours,
    delivery_days: account.delivery_days,
  };
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          result(await saveLingoAccount({ id: account.id, ...v }));
          setBusy(false);
        }}
      >
        <h2 className="type-h3 text-ink sm:col-span-2">Bot settings</h2>
        <Field label="Business name" optionalLabel="">
          <Input value={v.business_name} onChange={(e) => setV({ ...v, business_name: e.target.value })} required />
        </Field>
        <Field label="Staff name the bot uses">
          <Input value={v.staff_name} onChange={(e) => setV({ ...v, staff_name: e.target.value })} />
        </Field>
        <Field label="Owner's WhatsApp (new-order alerts)" hint="With country code">
          <Input value={v.owner_phone} inputMode="numeric" onChange={(e) => setV({ ...v, owner_phone: e.target.value })} />
        </Field>
        <Field label="Reply language" optionalLabel="">
          <Select value={v.default_language} onChange={(e) => setV({ ...v, default_language: e.target.value as Lang })} options={LANGS} />
        </Field>
        <Field label="Product text language" optionalLabel="">
          <Select value={v.content_language} onChange={(e) => setV({ ...v, content_language: e.target.value as Lang })} options={LANGS} />
        </Field>
        <Field label="Follow up after (hours)" optionalLabel="">
          <Input type="number" min={1} max={72} value={v.followup_hours} onChange={(e) => setV({ ...v, followup_hours: Number(e.target.value) })} />
        </Field>
        <Field label="Delivery days (told to customers)" optionalLabel="">
          <Input type="number" min={1} max={30} value={v.delivery_days} onChange={(e) => setV({ ...v, delivery_days: Number(e.target.value) })} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} disabled={!dirty}>
            Save settings
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** WhatsApp connection through Evolution API. The key is write-only. */
export function LingoConnectionCard({ account, canAdmin }: { account: LingoAccountRow; canAdmin: boolean }) {
  const result = useResult();
  const [v, setV] = useState({ evolution_instance: account.evolution_instance, evolution_base_url: account.evolution_base_url, evolution_apikey: "" });
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          if (result(await saveLingoConnection({ id: account.id, ...v }))) setV((x) => ({ ...x, evolution_apikey: "" }));
          setBusy(false);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
          <h2 className="type-h3 text-ink">WhatsApp connection</h2>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={checking}
            icon={<PlugZap aria-hidden size={14} strokeWidth={1.5} />}
            onClick={async () => {
              setChecking(true);
              const r = await checkLingoConnection({ id: account.id });
              setChecking(false);
              if (r.ok && r.data === "open") toast.success(r.message);
              else if (r.ok) toast.warning(r.message);
              else toast.error(r.message);
            }}
          >
            Check connection
          </Button>
        </div>
        <Field label="Evolution instance name" optionalLabel="">
          <Input value={v.evolution_instance} disabled={!canAdmin} onChange={(e) => setV({ ...v, evolution_instance: e.target.value })} required />
        </Field>
        <Field label="Evolution API address" optionalLabel="">
          <Input type="url" value={v.evolution_base_url} disabled={!canAdmin} onChange={(e) => setV({ ...v, evolution_base_url: e.target.value })} required />
        </Field>
        {canAdmin ? (
          <>
            <Field label="Instance API key" hint="Saved and hidden. Type a new one only to replace it.">
              <Input type="password" autoComplete="off" placeholder="••••••••" value={v.evolution_apikey} onChange={(e) => setV({ ...v, evolution_apikey: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                Save connection
              </Button>
            </div>
          </>
        ) : (
          <p className="type-small text-ink-muted sm:col-span-2">Only admins can change the connection.</p>
        )}
      </form>
    </Card>
  );
}
