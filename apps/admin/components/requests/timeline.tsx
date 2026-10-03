"use client";

import { Button, Card, Checkbox, Field, StatusBadge, cn, formatDate, type Tone } from "@retexia/ui";
import { CreditCard, MessageSquareText, Pin, PinOff, StickyNote, Trash2, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addNote, updateNote } from "@/app/(panel)/requests/actions";
import { Markdown } from "@/components/common/markdown";
import { MarkdownEditor } from "@/components/common/markdown-editor";

export type TimelineItem = {
  id: string;
  kind: "event" | "note" | "run" | "payment";
  at: string;
  title: string;
  body?: string | null;
  by?: string | null;
  tone?: Tone;
  badge?: string;
  pinned?: boolean;
  canEdit?: boolean;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "event", label: "Customer timeline" },
  { key: "note", label: "Internal notes" },
  { key: "run", label: "Actions" },
  { key: "payment", label: "Payments" },
] as const;

const icons = { event: MessageSquareText, note: StickyNote, run: Workflow, payment: CreditCard };

/** Customer events, internal notes, action runs and payments in one chronological list. */
export function Timeline({ orderId, orderRef, items, canOperate }: { orderId: string; orderRef: string; items: TimelineItem[]; canOperate: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [pending, setPending] = useState(false);

  const shown = items
    .filter((i) => filter === "all" || i.kind === filter)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "h-8 rounded-full px-3 type-label transition-hover focus-visible:focus-ring",
                filter === f.key ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {shown.length ? (
          <ol className="relative flex flex-col gap-5 border-l border-line pl-6">
            {shown.map((item) => {
              const Icon = icons[item.kind];
              return (
                <li key={`${item.kind}-${item.id}`} className="relative flex flex-col gap-1">
                  <span className="absolute top-0 -left-[37px] flex size-6 items-center justify-center rounded-full border border-line bg-surface-raised text-ink-muted">
                    <Icon aria-hidden size={13} strokeWidth={1.5} />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-label text-ink">{item.title}</span>
                    {item.badge ? <StatusBadge tone={item.tone ?? "neutral"} label={item.badge} /> : null}
                    {item.pinned ? <span className="type-caption text-brand">Pinned</span> : null}
                    {item.kind === "note" ? <span className="type-caption text-ink-muted">Internal</span> : null}
                  </div>
                  <span className="type-small text-ink-muted">
                    {formatDate(item.at, "en-LK", true)}
                    {item.by ? ` · ${item.by}` : ""}
                  </span>
                  {item.body ? (
                    item.kind === "note" ? (
                      <Markdown className="mt-1">{item.body}</Markdown>
                    ) : (
                      <p className="mt-1 type-body whitespace-pre-line text-ink-muted">{item.body}</p>
                    )
                  ) : null}
                  {item.kind === "note" && item.canEdit ? (
                    <div className="mt-1 flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={item.pinned ? <PinOff aria-hidden size={14} strokeWidth={1.5} /> : <Pin aria-hidden size={14} strokeWidth={1.5} />}
                        onClick={async () => {
                          const r = await updateNote({ id: item.id, ref: orderRef, pinned: !item.pinned });
                          toast[r.ok ? "success" : "error"](r.message ?? "");
                          router.refresh();
                        }}
                      >
                        {item.pinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                        onClick={async () => {
                          if (!window.confirm("Delete this note?")) return;
                          const r = await updateNote({ id: item.id, ref: orderRef, remove: true });
                          toast[r.ok ? "success" : "error"](r.message ?? "");
                          router.refresh();
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="py-6 text-center type-body text-ink-muted">Nothing here yet.</p>
        )}
      </Card>
      {canOperate ? (
        <Card className="flex flex-col gap-4 self-start">
          <h2 className="type-h2 text-ink">Add internal note</h2>
          <form
            method="post"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!body.trim()) return;
              setPending(true);
              const r = await addNote({ orderId, ref: orderRef, body, pinned });
              setPending(false);
              toast[r.ok ? "success" : "error"](r.message ?? "");
              if (r.ok) {
                setBody("");
                setPinned(false);
                router.refresh();
              }
            }}
            className="flex flex-col gap-4"
          >
            <Field label="Note" hint="Only the team sees notes." required>
              <MarkdownEditor value={body} onChange={setBody} rows={5} />
            </Field>
            <Checkbox label="Pin to the top" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            <Button type="submit" loading={pending} disabled={!body.trim()}>
              Add note
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
