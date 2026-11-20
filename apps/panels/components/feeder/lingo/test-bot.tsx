"use client";

import { Badge, Button, Card, Field, Input, Select } from "@retexia/ui";
import { RotateCcw, Send } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { resetTestBot, testBot, type TestReply } from "@/app/feeder/(app)/lingo/actions";
import { ROUTE, STAGE, usd } from "@/lib/feeder/lingo/labels";
import { BodyBubble, WaBubble } from "./common";

type Item =
  | { kind: "customer"; text: string }
  | { kind: "bot"; body: Record<string, unknown>; meta?: TestReply; first: boolean }
  | { kind: "note"; text: string };

type Interactive = { type?: string; action?: { buttons?: { reply: { id: string; title: string } }[]; sections?: { rows: { id: string; title: string }[] }[] } };

export function TestBot({ products, ready }: { products: { id: number; name: string }[]; ready: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("Hello! Can I get more info on this?");
  const [product, setProduct] = useState(products[0] ? String(products[0].id) : "");
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState(0);
  const end = useRef<HTMLDivElement>(null);

  async function send(input: { text?: string; tap?: { id: string; title: string } }) {
    setBusy(true);
    setItems((x) => [...x, { kind: "customer", text: input.tap ? `[${input.tap.title}]` : input.text! }]);
    try {
      const r = await testBot({ ...input, start_product: items.length ? null : product ? Number(product) : null });
      if (!r.ok) {
        toast.error(r.message);
        setItems((x) => [...x, { kind: "note", text: r.message }]);
        return;
      }
      const d = r.data!;
      if (d.stopped || !d.messages?.length) setItems((x) => [...x, { kind: "note", text: d.stopped === "paused" ? "This test chat is handed to you (paused). Press New chat to start again." : `No reply (${d.stopped ?? "nothing to send"}).` }]);
      else setItems((x) => [...x, ...d.messages!.map((m, i) => ({ kind: "bot" as const, body: m.body, meta: i === 0 ? d : undefined, first: i === 0 }))]);
      setTotal((t) => t + Number(d.cost_usd ?? 0));
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="flex min-h-[28rem] flex-col gap-3" padded={false}>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-surface-sunk p-4">
          {!items.length ? <p className="m-auto max-w-sm text-center type-small text-ink-muted">Type as a customer would, in Sinhala, Singlish or English. Lingo answers exactly as it would on WhatsApp, but nothing is sent and no order goes to Feeder.</p> : null}
          {items.map((it, i) => {
            if (it.kind === "customer") return <WaBubble key={i} customer text={it.text} />;
            if (it.kind === "note") return <p key={i} className="self-center rounded-full bg-surface-raised px-3 py-1 type-small text-ink-muted">{it.text}</p>;
            const inter = (it.body as { interactive?: Interactive }).interactive;
            const taps = inter?.type === "button" ? (inter.action?.buttons ?? []).map((b) => b.reply) : inter?.type === "list" ? (inter.action?.sections?.[0]?.rows ?? []) : [];
            const m = it.meta;
            return (
              <div key={i} className="flex flex-col items-end gap-1">
                <BodyBubble
                  body={it.body}
                  meta={m ? (
                    <>
                      {m.route ? <Badge tone="neutral">{ROUTE[m.route]?.label ?? m.route} · level {ROUTE[m.route]?.level ?? "?"}</Badge> : null}
                      {m.stage ? <span>stage: {STAGE[m.stage]?.label ?? m.stage}</span> : null}
                      <span>{(m.ai ?? []).length ? (m.ai ?? []).map((a) => `${a.stage} ${a.in}→${a.out} tokens`).join(" · ") : "no AI"}</span>
                      <span>{usd(m.cost_usd ?? 0, 5)}</span>
                      {m.handoff ? <span className="text-danger">handed to you: {m.handoff.reason}</span> : null}
                    </>
                  ) : undefined}
                />
                {taps.length ? (
                  <div className="flex flex-wrap justify-end gap-1">
                    {taps.map((t) => (
                      <Button key={t.id} size="sm" variant="secondary" disabled={busy} onClick={() => send({ tap: { id: t.id, title: t.title } })}>{t.title}</Button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          <div ref={end} />
        </div>
        <form className="flex items-end gap-2 border-t border-line p-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { void send({ text }); setText(""); } }}>
          <Field label="Message as the customer" className="flex-1">
            <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} disabled={!ready} />
          </Field>
          <Button type="submit" disabled={busy || !ready || !text.trim()}>
            <Send aria-hidden size={16} strokeWidth={1.75} />
            {busy ? "…" : "Send"}
          </Button>
        </form>
      </Card>
      <aside className="flex flex-col gap-3">
        <Card className="flex flex-col gap-3">
          <Field label="Start as if from an ad for" hint="Used for the first message of a test chat.">
            <Select value={product} onChange={(e) => setProduct(e.target.value)} placeholder="No product (asks which one)" options={products.map((p) => ({ value: String(p.id), label: p.name }))} />
          </Field>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              const r = await resetTestBot();
              if (r.ok) { setItems([]); setTotal(0); } else toast.error(r.message);
            }}
          >
            <RotateCcw aria-hidden size={16} strokeWidth={1.75} />
            New chat
          </Button>
        </Card>
        <Card className="flex flex-col gap-1">
          <p className="type-label text-ink-muted">AI cost of this test chat</p>
          <p className="type-h2 text-ink">{usd(total, 5)}</p>
          <p className="type-small text-ink-muted">Same route and cost as a real WhatsApp message. Test chats aren&apos;t counted on the dashboard.</p>
        </Card>
        {!ready ? <p className="type-small text-danger">Lingo&apos;s engine isn&apos;t connected yet, so the Test bot can&apos;t run.</p> : null}
      </aside>
    </div>
  );
}
