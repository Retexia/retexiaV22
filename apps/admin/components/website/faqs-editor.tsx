"use client";

import { Badge, Button, Card, Field, Input, Select, Switch } from "@retexia/ui";
import { ConfirmDialog, SortableList } from "@retexia/ui/admin";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteContent, reorderContent, saveFaq } from "@/app/(panel)/website/actions";
import { MarkdownEditor } from "@/components/common/markdown-editor";

export type Faq = { id?: string; product_id: string | null; question: string; answer: string; is_visible: boolean };

/** FAQ list for one product, or the general FAQs (productId null). */
export function FaqsEditor({ faqs, productId, products }: { faqs: (Faq & { id: string })[]; productId?: string | null; products?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [items, setItems] = useState(faqs);
  const [edit, setEdit] = useState<Faq | null>(null);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<(Faq & { id: string }) | null>(null);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const r = await saveFaq(edit);
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success(r.message ?? "Saved");
    setEdit(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="type-body text-ink-muted">{productId ? "Shown in this product's FAQ section." : "General questions, plus each product's own."} Drag to reorder.</p>
        <Button size="sm" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setEdit({ product_id: productId ?? null, question: "", answer: "", is_visible: true })}>
          Add question
        </Button>
      </div>
      {edit ? (
        <Card className="flex flex-col gap-4 border-brand/40!">
          <Field label="Question" required>
            <Input autoFocus value={edit.question} onChange={(e) => setEdit({ ...edit, question: e.target.value })} />
          </Field>
          <Field label="Answer" hint="Markdown: **bold**, lists and links work." required labelAs="legend">
            <MarkdownEditor value={edit.answer} onChange={(answer) => setEdit({ ...edit, answer })} rows={5} />
          </Field>
          <div className="flex flex-wrap items-end gap-6">
            {products && productId === undefined ? (
              <Field label="Product" className="min-w-56">
                <Select value={edit.product_id ?? ""} onChange={(e) => setEdit({ ...edit, product_id: e.target.value || null })} options={products.map((p) => ({ value: p.id, label: p.name }))} placeholder="General" />
              </Field>
            ) : null}
            <Switch checked={edit.is_visible} onCheckedChange={(v) => setEdit({ ...edit, is_visible: v })} label="Shown on the website" />
          </div>
          <div className="flex gap-2">
            <Button loading={busy} onClick={save}>
              Save question
            </Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
      {items.length ? (
        <SortableList
          items={items}
          getId={(f) => f.id}
          getLabel={(f) => f.question}
          className="flex flex-col gap-2"
          onReorder={async (ids) => {
            setItems(ids.map((i) => items.find((f) => f.id === i)!));
            const r = await reorderContent({ table: "faqs", ids });
            if (!r.ok) toast.error(r.message);
          }}
          renderItem={(f, handle) => (
            <div className="flex items-center gap-3 rounded-md border border-line bg-surface-raised px-3 py-2.5">
              {handle}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="type-label text-ink">{f.question}</span>
                <span className="truncate type-small text-ink-muted">{f.answer}</span>
              </div>
              {products && productId === undefined ? <Badge tone="neutral">{products.find((p) => p.id === f.product_id)?.name ?? "General"}</Badge> : null}
              {!f.is_visible ? <Badge tone="neutral">Hidden</Badge> : null}
              <Button size="sm" variant="ghost" icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setEdit(f)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setRemove(f)}>
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          )}
        />
      ) : edit ? null : (
        <Card>
          <p className="type-body text-ink-muted">No questions yet.</p>
        </Card>
      )}
      <ConfirmDialog
        open={Boolean(remove)}
        onOpenChange={(o) => !o && setRemove(null)}
        title="Delete this question?"
        description={remove?.question}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!remove) return;
          const r = await deleteContent({ table: "faqs", id: remove.id });
          toast[r.ok ? "success" : "error"](r.message ?? "");
          setRemove(null);
          if (r.ok) {
            setItems(items.filter((i) => i.id !== remove.id));
            router.refresh();
          }
        }}
      />
    </div>
  );
}
