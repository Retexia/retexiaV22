"use client";

import { Alert, Button, Card, Field, Select, Textarea } from "@retexia/ui";
import { ArrowLeft, Phone, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markCalled, replyToChat, setChatPaused, setChatStatus } from "@/app/feeder/(app)/lingo-feeder/actions";
import type { Chat, Message, Order } from "@/lib/feeder/lingo-feeder/data";
import { LANG, SET_STATUSES, lkr, statusOf, showPhone, timeAgo, when, windowOpen } from "@/lib/feeder/lingo-feeder/labels";
import { Bubble, StatusBadge, useAction } from "./common";

export function ChatView({ chat, messages, orders, product }: { chat: Chat; messages: Message[]; orders: Order[]; product: { product_id: number; name: string; picture_url: string | null } | null }) {
  const { pending, go } = useAction();
  const [reply, setReply] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  const paused = Boolean(chat.paused_until && new Date(chat.paused_until) > new Date());
  const open = windowOpen(chat.last_in_at);
  const name = chat.details?.name || chat.profile_name || showPhone(chat.phone);
  const tel = "0" + chat.phone.replace(/^94/, "");

  return (
    <div className="flex flex-col gap-4">
      <Link href="/lingo-feeder/chats" className="inline-flex items-center gap-1 self-start type-small text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden size={14} strokeWidth={1.75} /> All chats
      </Link>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card padded={false} className="flex min-h-[32rem] flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="type-h3 text-ink">{name}</h2>
            <StatusBadge status={chat.status} call={chat.needs_call} />
            {paused ? <span className="type-small text-warning">Lingo is quiet here (you&apos;re answering)</span> : null}
          </div>
          <div className="flex max-h-[65vh] flex-1 flex-col gap-3 overflow-y-auto bg-surface-sunk p-4">
            {messages.map((m) => {
              const meta = m.meta ?? {};
              const side = m.role === "c" ? "in" : "out";
              const who = m.role === "c" ? null : m.role === "s" ? "You" : "Lingo";
              return (
                <Bubble
                  key={m.id}
                  side={side}
                  tone={m.role === "c" ? "customer" : m.role === "s" ? "seller" : "lingo"}
                  image={meta.image ?? null}
                  text={m.content}
                  buttons={meta.buttons?.map((t) => ({ title: t }))}
                  list={meta.list ? { button: meta.list, rows: (meta.rows ?? []).map((t) => ({ title: t })) } : undefined}
                  meta={<>{who ? <span>{who}{m.route === "followup" ? " · follow-up" : ""}</span> : m.kind === "voice" ? <span>🎤 voice note</span> : m.kind === "image" ? <span>📷 photo</span> : null}<span>{when(m.created_at)}</span>{m.role !== "c" && m.status ? <span>{m.status === "read" ? "✓✓ read" : m.status === "delivered" ? "✓✓" : m.status === "failed" ? "not sent" : "✓"}</span> : null}</>}
                />
              );
            })}
            <div ref={end} />
          </div>
          <form
            className="flex flex-col gap-2 border-t border-line p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await go(() => replyToChat({ phone: chat.phone, text: reply }));
              if (r.ok) setReply("");
            }}
          >
            {open ? (
              <>
                <Field label="Reply as your shop" optionalLabel="" hint="Lingo then stays quiet in this chat for 12 hours.">
                  <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} />
                </Field>
                <Button type="submit" size="sm" disabled={pending || !reply.trim()} className="self-end">
                  <Send aria-hidden size={14} strokeWidth={1.75} /> Send on WhatsApp
                </Button>
              </>
            ) : (
              <p className="type-small text-ink-muted">More than 24 hours since their last message: WhatsApp doesn&apos;t allow a free reply now. Call them instead.</p>
            )}
          </form>
        </Card>

        <aside className="flex flex-col gap-4">
          {chat.needs_call ? (
            <Alert tone="danger" title="Call this customer" action={<Button size="sm" variant="secondary" disabled={pending} onClick={() => go(() => markCalled({ phone: chat.phone, called: true }))}>Called ✓</Button>}>
              {chat.call_reason ?? "They need you."}
            </Alert>
          ) : null}
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="type-label text-ink">{name}</p>
              <a href={`tel:${tel}`} className="inline-flex items-center gap-1 type-body text-brand hover:underline">
                <Phone aria-hidden size={14} strokeWidth={1.75} /> {showPhone(chat.phone)}
              </a>
              {chat.details?.phone && chat.details.phone !== tel ? <a href={`tel:${chat.details.phone}`} className="type-small text-brand hover:underline">{chat.details.phone}{chat.details.phone2 ? ` / ${chat.details.phone2}` : ""}</a> : null}
              {chat.details?.address ? <p className="type-small text-ink-muted">{chat.details.address}</p> : null}
              <p className="type-small text-ink-muted">Writes {LANG[chat.lang] ?? chat.lang} · first message {timeAgo(chat.created_at)}</p>
            </div>
            {product ? (
              <div className="flex items-center gap-2 rounded-md bg-surface-sunk p-2">
                {product.picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- public product photo
                  <img src={product.picture_url} alt="" className="size-10 rounded object-cover" />
                ) : null}
                <span className="type-small text-ink">Talking about: {product.name}</span>
              </div>
            ) : null}
            <Field label="Status" optionalLabel="">
              <Select
                value={chat.status}
                disabled={pending}
                onChange={(e) => go(() => setChatStatus({ phone: chat.phone, status: e.target.value }))}
                options={SET_STATUSES.map((s) => ({ value: s, label: statusOf(s).label }))}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {!chat.needs_call ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => go(() => markCalled({ phone: chat.phone, called: false }))}>📞 Add to Call them</Button> : null}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(() => setChatPaused({ phone: chat.phone, paused: !paused }))}>
                {paused ? "Let Lingo answer" : "Pause Lingo here"}
              </Button>
            </div>
            {chat.memo ? <p className="type-small text-ink-muted">Lingo&apos;s note: {chat.memo}</p> : null}
          </Card>
          <Card className="flex flex-col gap-2">
            <h3 className="type-label text-ink">Orders</h3>
            {orders.length ? (
              <ul className="flex flex-col gap-2">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-md border border-line p-2">
                    <p className="type-small text-ink">#{o.id} · {o.product_name} × {o.qty}</p>
                    <p className="type-small text-ink-muted">{lkr(o.total)} · {o.status === "cancelled" ? "cancelled" : o.exported_at ? "in a courier file" : "new"} · {when(o.confirmed_at ?? o.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-small text-ink-muted">No orders yet.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
