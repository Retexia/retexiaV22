"use client";

import { Alert, Button, Card, Field, Input, Select, Switch } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CustomerPicker } from "@/components/common/customer-picker";
import type { CustomerOption } from "@/app/(panel)/customers/actions";
import { savePostSubscription, setPostAccountEnabled, setPostBusinessPaused, setPostOwner, setPostSystem } from "./actions";
import { POST_PLAN_OPTIONS, SUBSCRIPTION_OPTIONS } from "./limits";
import type { PostSystem } from "./data";

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

/** Emergency switches for every Retexia Post business. */
export function PostSystemSwitches({ system, canAdmin }: { system: PostSystem; canAdmin: boolean }) {
  const result = useResult();
  const [note, setNote] = useState(system.note ?? "");
  const save = async (patch: { generation_paused?: boolean; publishing_paused?: boolean }) =>
    result(await setPostSystem({ generation_paused: system.generation_paused, publishing_paused: system.publishing_paused, ...patch, note }));
  const paused = system.generation_paused || system.publishing_paused;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="type-h3 text-ink">Every business</h2>
      {paused ? (
        <Alert tone="warning" title="Retexia Post is paused">
          {system.publishing_paused ? "Nothing is being published. " : ""}
          {system.generation_paused ? "No new posts are being made. " : ""}
          {system.note ?? ""}
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Switch
          checked={!system.publishing_paused}
          disabled={!canAdmin}
          onCheckedChange={(on) => save({ publishing_paused: !on })}
          label="Publishing"
          description="Off: no business publishes anything (Meta outage, national mourning day). Posts wait and go out when it is back on."
        />
        <Switch
          checked={!system.generation_paused}
          disabled={!canAdmin}
          onCheckedChange={(on) => save({ generation_paused: !on })}
          label="Nightly AI posts"
          description="Off: the 1 AM batch makes nothing (AI provider problem or bad model update). Owners can still make posts by hand."
        />
      </div>
      {canAdmin ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Reason (for the team)" className="min-w-64 flex-1">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Meta outage, back at 6 PM" />
          </Field>
          <Button variant="secondary" disabled={note === (system.note ?? "")} onClick={() => save({})}>
            Save reason
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function PostBusinessControls({
  id,
  plan,
  status,
  paused,
  canAdmin,
}: {
  id: string;
  plan: string;
  status: string;
  paused: boolean;
  canAdmin: boolean;
}) {
  const result = useResult();
  const [v, setV] = useState({ plan, subscription_status: status });
  const [busy, setBusy] = useState(false);
  return (
    <Card className="flex flex-col gap-5">
      <Switch
        checked={!paused}
        onCheckedChange={async (on) => result(await setPostBusinessPaused({ id, paused: !on }))}
        label="Posting for this business"
        description="Off (vacation mode): nothing is generated or published. The owner can switch it too."
      />
      <form
        className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          result(await savePostSubscription({ id, ...v }));
          setBusy(false);
        }}
      >
        <Field label="Plan" optionalLabel="">
          <Select value={v.plan} disabled={!canAdmin} onChange={(e) => setV({ ...v, plan: e.target.value })} options={POST_PLAN_OPTIONS} />
        </Field>
        <Field label="Subscription" optionalLabel="">
          <Select value={v.subscription_status} disabled={!canAdmin} onChange={(e) => setV({ ...v, subscription_status: e.target.value })} options={SUBSCRIPTION_OPTIONS} />
        </Field>
        {canAdmin ? (
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy} disabled={v.plan === plan && v.subscription_status === status}>
              Save plan
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

export function PostOwnerChange({ id }: { id: string }) {
  const result = useResult();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<CustomerOption | null>(null);
  if (!open)
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Move to another customer
      </Button>
    );
  return (
    <div className="flex flex-col gap-3">
      <CustomerPicker value={pick} onChange={setPick} canInvite={false} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!pick} onClick={async () => pick && result(await setPostOwner({ id, userId: pick.id })) && setOpen(false)}>
          Move business
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function PostAccountSwitch({ businessId, accountId, enabled, label }: { businessId: string; accountId: string; enabled: boolean; label: string }) {
  const result = useResult();
  return <Switch checked={enabled} onCheckedChange={async (on) => result(await setPostAccountEnabled({ businessId, accountId, enabled: on }))} label={label} />;
}
