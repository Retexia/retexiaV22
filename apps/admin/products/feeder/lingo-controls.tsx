"use client";

import { Button, Dialog, Field, Input, Select, Textarea } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveModelPrice, saveSharedContent, setLingoSeller } from "./lingo-actions";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        after?.();
        router.refresh();
      } else toast.error(r.message ?? "Couldn't save");
    });
  return { pending, save };
}

export function SellerControls({ id, budget, status, disabled }: { id: number; budget: number; status: string; disabled: boolean }) {
  const [b, setB] = useState(String(budget));
  const [s, setS] = useState(status);
  const { pending, save } = useSave();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="AI allowance (US$ / month)" className="w-36">
        <Input type="number" min={0} step="0.5" value={b} onChange={(e) => setB(e.target.value)} disabled={disabled} />
      </Field>
      <Field label="Status" className="w-36">
        <Select value={s} onChange={(e) => setS(e.target.value)} disabled={disabled} options={[{ value: "setup", label: "Setting up" }, { value: "live", label: "On" }, { value: "paused", label: "Off" }, { value: "blocked", label: "Blocked" }]} />
      </Field>
      <Button size="sm" variant="secondary" disabled={disabled || pending} onClick={() => save(() => setLingoSeller({ lingo_user_id: id, budget: b, status: s as "live" }))}>Save</Button>
    </div>
  );
}

export function PriceRow({ row, disabled }: { row: { model: string; in_per_m: number; out_per_m: number; audio_in_per_m: number; cached_in_per_m: number }; disabled: boolean }) {
  const [v, setV] = useState({ in_per_m: String(row.in_per_m), out_per_m: String(row.out_per_m), audio_in_per_m: String(row.audio_in_per_m), cached_in_per_m: String(row.cached_in_per_m) });
  const { pending, save } = useSave();
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="py-2 pr-3 font-mono type-small text-ink">{row.model}</td>
      {(["in_per_m", "out_per_m", "audio_in_per_m", "cached_in_per_m"] as const).map((k) => (
        <td key={k} className="py-2 pr-3">
          <Input aria-label={`${row.model} ${k}`} type="number" min={0} step="0.001" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} disabled={disabled} className="w-24" />
        </td>
      ))}
      <td className="py-2">
        <Button size="sm" variant="secondary" disabled={disabled || pending} onClick={() => save(() => saveModelPrice({ model: row.model, ...v }))}>Save</Button>
      </td>
    </tr>
  );
}

const FIELDS = [
  ["picture_url", "Photo link (public https)", 1],
  ["long_description", "Long description (first message; use {price} {delivery_fee})", 5],
  ["short_description", "Short info", 1],
  ["application", "How to use", 3],
  ["precautions", "Precautions", 3],
  ["ingredients", "Ingredients", 2],
  ["symptoms", "Problems it helps with (comma separated)", 1],
  ["aliases", "Other names (comma separated)", 1],
] as const;
type ContentKey = (typeof FIELDS)[number][0];

export function SharedContentButton({ productId, name, content, disabled }: { productId: number; name: string; content: Partial<Record<ContentKey, string | null>> | null; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<ContentKey, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, String(content?.[k] ?? "")])) as Record<ContentKey, string>);
  const { pending, save } = useSave();
  return (
    <>
      <Button size="sm" variant={content ? "ghost" : "secondary"} onClick={() => setOpen(true)}>{content ? "Edit" : "Add content"}</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={name}
        description={`Shared Lingo content for Feeder product ${productId}. Every seller of this product gets it unless they write their own.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={disabled || pending} onClick={() => save(() => saveSharedContent({ product_id_feeder: productId, ...v }), () => setOpen(false))}>Save</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {FIELDS.map(([k, label, rows]) => (
            <Field key={k} label={label}>
              {rows > 1 ? <Textarea rows={rows} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /> : <Input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
            </Field>
          ))}
        </div>
      </Dialog>
    </>
  );
}
