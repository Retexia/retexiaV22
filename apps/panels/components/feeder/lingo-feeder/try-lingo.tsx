"use client";

import { Badge, Button, Card, Field, Input, Select } from "@retexia/ui";
import { RotateCcw, Send } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { resetTry, tryLingo, type TryReply } from "@/app/feeder/(app)/lingo-feeder/actions";
import { statusOf } from "@/lib/feeder/lingo-feeder/labels";
import { BodyBubble, Bubble } from "./common";

type Item =
  | { kind: "customer"; text: string }
  | { kind: "lingo"; body: Record<string, unknown>; meta?: TryReply; last: boolean }
  | { kind: "note"; text: string };

const SAMPLES = ["Kiyada?", "Dawas kiyak yanawada", "කිරි දෙන අම්මලාට පාවිච්චි කරන්න පුළුවන්ද?", "Mata dekak ona", "Nimal Perera\nNo 12, Temple Road, Galle\n0771234567", "mata call ekak denna"];

export function TryLingo({ products, initial, ready }: { products: { id: number; name: string }[]; initial: number | null; ready: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("Hello! Can I get more info on this?");
  const [product, setProduct] = useState(initial ? String(initial) : "");
  const [name, setName] = useState("Nimal");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ status: string; call: boolean } | null>(null);
  const end = useRef<HTMLDivElement>(null);

  async function send(input: { text?: string; tap?: { id: string; title: string } }) {
    setBusy(true);
    setItems((x) => [...x.map((i) => (i.kind === "lingo" ? { ...i, last: false } : i)), { kind: "customer", text: input.tap ? input.tap.title : input.text! }]);
    try {
      const r = await tryLingo({ ...input, name, start_product: items.length ? null : product ? Number(product) : null });
      if (!r.ok) {
        setItems((x) => [...x, { kind: "note", text: r.message }]);
        toast.error(r.message);
        return;
      }
      const d = r.data!;
      if (d.stopped) setItems((x) => [...x, { kind: "note", text: d.stopped === "paused" ? "Lingo stepped back in this chat (a person should answer). Press New chat to start again." : `No reply (${d.stopped}).` }]);
      else if (!d.messages?.length) setItems((x) => [...x, { kind: "note", text: "Lingo didn't need to answer that." }]);
      else setItems((x) => [...x, ...d.messages!.map((m, i, all) => ({ kind: "lingo" as const, body: m.body, meta: i === all.length - 1 ? d : undefined, last: true }))]);
      if (d.status) setStatus({ status: d.status, call: Boolean(d.needs_call) });
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card padded={false} className="flex min-h-[34rem] flex-col">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-success-soft type-label text-success">L</span>
          <div className="flex flex-col">
            <span className="type-label text-ink">Lingo</span>
            <span className="type-small text-ink-muted">{busy ? "typing…" : "test chat · nothing is sent to WhatsApp"}</span>
          </div>
        </div>
        <div className="flex max-h-[65vh] flex-1 flex-col gap-3 overflow-y-auto bg-surface-sunk p-4">
          {!items.length ? (
            <p className="m-auto max-w-sm text-center type-small text-ink-muted">
              Chat as a customer who tapped your ad. Lingo answers exactly as on WhatsApp: tap her buttons, write in Sinhala, Singlish or English. No order goes to Feeder.
            </p>
          ) : null}
          {items.map((it, i) => {
            if (it.kind === "customer") return <Bubble key={i} side="in" tone="customer" text={it.text} />;
            if (it.kind === "note") return <p key={i} className="self-center rounded-full bg-surface-raised px-3 py-1 text-center type-small text-ink-muted">{it.text}</p>;
            const m = it.meta;
            return (
              <BodyBubble
                key={i}
                body={it.body}
                onTap={it.last && !busy ? (t) => send({ tap: t }) : undefined}
                meta={m?.needs_call ? <span className="text-danger">📞 {m.call_reason ?? "Call them"}</span> : undefined}
              />
            );
          })}
          <div ref={end} />
        </div>
        <form className="flex flex-col gap-2 border-t border-line p-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { void send({ text }); setText(""); } }}>
          <div className="flex items-end gap-2">
            <Field label="Message as the customer" optionalLabel="" className="flex-1">
              <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} disabled={!ready} />
            </Field>
            <Button type="submit" disabled={busy || !ready || !text.trim()} aria-label="Send">
              <Send aria-hidden size={16} strokeWidth={1.75} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {SAMPLES.map((s) => (
              <button key={s} type="button" onClick={() => setText(s)} className="max-w-full truncate rounded-full border border-line bg-surface-raised px-2 py-0.5 type-small text-ink-muted hover:text-ink focus-visible:focus-ring">
                {s.split("\n")[0]}
              </button>
            ))}
          </div>
        </form>
      </Card>
      <aside className="flex flex-col gap-3">
        <Card className="flex flex-col gap-3">
          <Field label="The ad they tapped was for" optionalLabel="" hint="Used for the first message of a test chat.">
            <Select value={product} onChange={(e) => setProduct(e.target.value)} placeholder="No product (Lingo asks which one)" options={products.map((p) => ({ value: String(p.id), label: p.name }))} />
          </Field>
          <Field label="Customer's WhatsApp name" optionalLabel="">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </Field>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const r = await resetTry();
              if (r.ok) { setItems([]); setStatus(null); setText("Hello! Can I get more info on this?"); } else toast.error(r.message);
            }}
          >
            <RotateCcw aria-hidden size={16} strokeWidth={1.75} /> New chat
          </Button>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="type-label text-ink-muted">This chat&apos;s status</p>
          {status ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusOf(status.status).tone}>{statusOf(status.status).label}</Badge>
              {status.call ? <Badge tone="danger">📞 Call them</Badge> : null}
            </div>
          ) : (
            <p className="type-small text-ink-muted">—</p>
          )}
          <p className="type-small text-ink-muted">Test chats aren&apos;t counted on Home or in Chats.</p>
        </Card>
        {!ready ? <p className="type-small text-danger">Lingo&apos;s engine isn&apos;t connected yet, so Try Lingo can&apos;t run.</p> : null}
      </aside>
    </div>
  );
}
