"use client";

import { Badge, Button, Dialog, Field, Input, Switch, Textarea } from "@retexia/ui";
import { useState } from "react";
import { deleteFaq, hideSharedFaq, promoteAnswer, saveFaq } from "@/app/feeder/(app)/lingo/actions";
import type { Faq } from "@/lib/feeder/lingo/data";
import { useAction } from "./common";

export function FaqDialog({ productId, faq, trigger }: { productId: number; faq?: Faq; trigger: string }) {
  const [open, setOpen] = useState(false);
  const blank = { question_en: "", variants: "", answer_si: "", answer_en: "", active: true };
  const [v, setV] = useState(() => (faq ? { question_en: faq.question_en, variants: faq.variants.join("\n"), answer_si: faq.answer_si ?? "", answer_en: faq.answer_en ?? "", active: faq.active } : blank));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, go } = useAction();
  return (
    <>
      <Button size="sm" variant={faq ? "ghost" : "secondary"} onClick={() => setOpen(true)}>{trigger}</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={faq ? "Edit FAQ" : "New FAQ"}
        description="The small AI sees only the short English question and picks this FAQ when a customer asks it, in any language. The answer is sent exactly as you write it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={pending}
              onClick={async () => {
                const r = await go(() => saveFaq({ id: faq?.id, product_id: productId, question_en: v.question_en, variants: v.variants.split("\n").map((x) => x.trim()).filter(Boolean), answer_si: v.answer_si, answer_en: v.answer_en, active: v.active }));
                setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
                if (r.ok) { setOpen(false); if (!faq) setV(blank); }
              }}
            >
              Save FAQ
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Question (short English)" hint="e.g. Can diabetics use it?" error={errors.question_en}>
            <Input value={v.question_en} onChange={(e) => setV({ ...v, question_en: e.target.value })} maxLength={200} />
          </Field>
          <Field label="How customers ask it" hint="Optional, one per line: their own words in Sinhala or Singlish (sugar thiyena ayata puluwanda…)." error={errors.variants}>
            <Textarea rows={3} value={v.variants} onChange={(e) => setV({ ...v, variants: e.target.value })} />
          </Field>
          <Field label="Answer in Sinhala" hint="Sinhala and Singlish customers get this one." error={errors.answer_si}>
            <Textarea rows={3} value={v.answer_si} onChange={(e) => setV({ ...v, answer_si: e.target.value })} maxLength={1000} />
          </Field>
          <Field label="Answer in English" hint="For customers who asked for English. Empty = the Sinhala answer." error={errors.answer_en}>
            <Textarea rows={3} value={v.answer_en} onChange={(e) => setV({ ...v, answer_en: e.target.value })} maxLength={1000} />
          </Field>
          <Switch checked={v.active} onCheckedChange={(x) => setV({ ...v, active: x })} label="Lingo uses this FAQ" />
        </div>
      </Dialog>
    </>
  );
}

export function FaqRow({ faq, mine, hidden, productId }: { faq: Faq; mine: boolean; hidden: boolean; productId: number }) {
  const { pending, go } = useAction();
  const SOURCE: Record<string, string> = { correction: "From your correction", cache: "From a saved answer", starter: "Starter", import: "From chats", manual: "" };
  return (
    <li className={`flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between ${hidden || !faq.active ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="type-label text-ink">{faq.question_en}</span>
          {!mine ? <Badge tone="neutral">Shared</Badge> : null}
          {SOURCE[faq.source] ? <Badge tone="neutral">{SOURCE[faq.source]}</Badge> : null}
          <span className="type-small text-ink-muted">{faq.hits} use{faq.hits === 1 ? "" : "s"}</span>
        </p>
        <p className="type-small whitespace-pre-wrap break-words text-ink-muted">{faq.answer_si || faq.answer_en}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {mine ? (
          <>
            <FaqDialog productId={productId} faq={faq} trigger="Edit" />
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(() => deleteFaq(faq.id))}>Delete</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(() => hideSharedFaq({ id: faq.id, hidden: !hidden }))}>{hidden ? "Use it" : "Don't use"}</Button>
        )}
      </div>
    </li>
  );
}

export function PromoteButton({ cacheKey }: { cacheKey: string }) {
  const { pending, go } = useAction();
  return <Button size="sm" variant="secondary" disabled={pending} onClick={() => go(() => promoteAnswer(cacheKey))}>Make FAQ</Button>;
}
