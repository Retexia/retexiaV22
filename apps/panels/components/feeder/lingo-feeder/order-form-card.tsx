"use client";

import { Alert, Badge, Button, Card, Switch } from "@retexia/ui";
import { setOrderFormOn, setupOrderForm } from "@/app/feeder/(app)/lingo-feeder/actions";
import type { WaNumber } from "@/lib/feeder/lingo-feeder/data";
import { when } from "@/lib/feeder/lingo-feeder/labels";
import { useAction } from "./common";

const FIELDS = ["නම (Name)", "ලිපිනය (Address)", "දුරකථන අංකය (Phone)", "තවත් අංකයක් (2nd)", "ප්‍රමාණය (Quantity) · with totals"];

/** WhatsApp tab: the order form customers fill in inside WhatsApp (a WhatsApp Flow in the seller's own account). */
export function OrderFormCard({ number }: { number: WaNumber | null }) {
  const { pending, go } = useAction();
  const ready = Boolean(number?.flow_id) && number?.flow_status === "published";
  const made = Boolean(number?.flow_id);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-xl flex-col gap-1">
          <h2 className="flex flex-wrap items-center gap-2 type-h3 text-ink">
            WhatsApp order form
            <Badge tone={ready ? "success" : number?.flow_status === "failed" ? "danger" : "neutral"}>
              {ready ? "On" : number?.flow_status === "failed" ? "Problem" : made ? "Off" : "Not created"}
            </Badge>
          </h2>
          <p className="type-small text-ink-muted">
            When a customer taps <strong>🛒 Order</strong>, a form opens inside WhatsApp. Their name and number are already filled in; they add the address and choose how many, and Lingo sends the summary to confirm. No typing mistakes, no missing details.
          </p>
        </div>
        {made ? <Switch checked={ready} disabled={pending} label={ready ? "Form on" : "Form off"} onCheckedChange={(x) => go(() => setOrderFormOn(x))} /> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex flex-col gap-3">
          {number?.flow_status === "failed" && number.flow_error ? <Alert tone="danger" title="WhatsApp didn't accept the form">{number.flow_error}</Alert> : null}
          <ul className="flex list-disc flex-col gap-1 pl-5 type-small text-ink-muted">
            <li>It is created in your own WhatsApp Business Account, so your number needs to be connected and its WhatsApp Business Account ID saved below.</li>
            <li>Customers who prefer typing can still send their details as a message.</li>
            {made ? <li>Made {when(number?.flow_at)}. &quot;Create again&quot; makes a fresh copy (for example after Retexia improves it).</li> : null}
          </ul>
          <Button className="self-start" variant={made ? "secondary" : "primary"} disabled={pending || !number} onClick={() => go(() => setupOrderForm())}>
            {pending ? "Creating…" : made ? "Create again" : "Create the order form"}
          </Button>
        </div>
        <div aria-hidden className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunk p-3">
          <p className="type-label text-ink">ඕඩර් එක · Order</p>
          {FIELDS.map((f) => (
            <div key={f} className="flex flex-col gap-0.5">
              <span className="type-small text-ink-muted">{f}</span>
              <span className="h-6 rounded border border-line bg-surface-raised" />
            </div>
          ))}
          <span className="mt-1 rounded-full bg-success py-1.5 text-center type-small text-on-brand">ඕඩර් එක යවන්න · Send order</span>
        </div>
      </div>
    </Card>
  );
}
