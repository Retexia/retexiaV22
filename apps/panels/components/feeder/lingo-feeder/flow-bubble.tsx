"use client";

import { Button, Field, Input, Select, Textarea } from "@retexia/ui";
import { useState } from "react";
import { Bubble } from "./common";

type FlowData = { product?: string; price_line?: string; pid?: string; name?: string; phone?: string; qty?: string; qty_options?: { id: string; title: string }[] };
type FlowBody = { interactive?: { type?: string; body?: { text?: string }; action?: { parameters?: { flow_cta?: string; flow_action_payload?: { data?: FlowData } } } } };

export const isFlow = (body: Record<string, unknown>) => (body as FlowBody).interactive?.type === "flow";

/**
 * Try Lingo: the order form message as the customer sees it. The button opens the same fields the
 * WhatsApp form has (prefilled the same way); sending it goes through Lingo exactly like a real form.
 */
export function FlowBubble({ body, disabled, onSubmit }: { body: Record<string, unknown>; disabled: boolean; onSubmit: (tap: { id: string; title: string }) => void }) {
  const it = (body as FlowBody).interactive!;
  const p = it.action?.parameters ?? {};
  const d = p.flow_action_payload?.data ?? {};
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: d.name ?? "", address: "", phone: d.phone ?? "", phone2: "", qty: d.qty ?? "1" });
  const ok = v.name.trim() && v.address.trim() && v.phone.trim();
  return (
    <div className="flex max-w-[88%] flex-col gap-2 self-end sm:max-w-[75%]">
      <Bubble text={it.body?.text} buttons={[{ id: "OPEN", title: p.flow_cta ?? "Order form" }]} onTap={disabled ? undefined : () => setOpen(true)} />
      {open && !disabled ? (
        <form
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4 shadow-soft"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok) return;
            onSubmit({ id: "FORM" + JSON.stringify({ ...v, pid: d.pid }), title: "📝 Order form" });
            setOpen(false);
          }}
        >
          <div>
            <p className="type-label text-ink">ඕඩර් එක · Order</p>
            <p className="type-small text-ink">{d.product}</p>
            <p className="type-small text-ink-muted">{d.price_line}</p>
          </div>
          <Field label="නම (Name)" required><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="ලිපිනය (Address)" required hint="ගෙදර අංකය, පාර, නගරය · House no, street, town"><Textarea rows={2} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></Field>
          <Field label="දුරකථන අංකය (Phone)" required><Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} inputMode="tel" /></Field>
          <Field label="තවත් අංකයක් (2nd)"><Input value={v.phone2} onChange={(e) => setV({ ...v, phone2: e.target.value })} inputMode="tel" /></Field>
          <Field label="ප්‍රමාණය (Quantity)" required>
            <Select value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} options={(d.qty_options ?? [{ id: "1", title: "1" }]).map((o) => ({ value: o.id, label: o.title }))} />
          </Field>
          <Button type="submit" disabled={!ok}>ඕඩර් එක යවන්න · Send order</Button>
        </form>
      ) : null}
    </div>
  );
}
