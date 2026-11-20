"use client";

import { Button, Dialog, Field, Input, Select, Textarea } from "@retexia/ui";
import { Pause, Play, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { rateMessage, replyToChat, saveOrder, setChatPaused } from "@/app/feeder/(app)/lingo/actions";
import type { OrderRow } from "@/lib/feeder/lingo/data";
import { useAction } from "./common";

/** 👍 / 👎 on a bot reply; 👎 asks for the right answer (it becomes an FAQ). */
export function RateButtons({ id, rating, correction }: { id: number; rating: number | null; correction: string | null }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(correction ?? "");
  const { pending, go } = useAction();
  return (
    <>
      <button
        type="button"
        aria-label="Good answer"
        aria-pressed={rating === 1}
        disabled={pending}
        onClick={() => go(() => rateMessage({ id, rating: 1 }), { quiet: true })}
        className={`rounded-full p-1 transition-hover focus-visible:focus-ring ${rating === 1 ? "text-success" : "text-ink-muted hover:text-ink"}`}
      >
        <ThumbsUp aria-hidden size={14} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        aria-label="Wrong answer: write the right one"
        aria-pressed={rating === -1}
        disabled={pending}
        onClick={() => setOpen(true)}
        className={`rounded-full p-1 transition-hover focus-visible:focus-ring ${rating === -1 ? "text-danger" : "text-ink-muted hover:text-ink"}`}
      >
        <ThumbsDown aria-hidden size={14} strokeWidth={1.75} />
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="What should Lingo have said?"
        description="Your answer is saved as an FAQ for this product. Next time someone asks the same thing, Lingo sends your words, without AI."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={pending || text.trim().length < 2}
              onClick={async () => {
                const r = await go(() => rateMessage({ id, rating: -1, correction: text }));
                if (r.ok) setOpen(false);
              }}
            >
              Save as FAQ
            </Button>
          </>
        }
      >
        <Field label="The right answer" hint="Write it the way you'd reply to the customer (Sinhala, Singlish or English).">
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        </Field>
      </Dialog>
    </>
  );
}

/** The seller's own reply (free text only inside WhatsApp's 24 h window). Sending pauses Lingo for the chat. */
export function ReplyBox({ phone, open }: { phone: string; open: boolean }) {
  const [text, setText] = useState("");
  const { pending, go } = useAction();
  if (!open)
    return (
      <p className="rounded-md border border-line bg-surface-sunk p-3 type-small text-ink-muted">
        The customer&apos;s last message was more than 24 hours ago. WhatsApp only lets businesses send free text within 24 hours of the customer&apos;s last message, so replying here is off until they write again. You can still call them.
      </p>
    );
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await go(() => replyToChat({ phone, text }));
        if (r.ok) setText("");
      }}
    >
      <Field label="Your reply" className="flex-1" hint="Sends from your WhatsApp number. Lingo stays paused for this chat until you resume it.">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
      </Field>
      <Button type="submit" disabled={pending || !text.trim()} aria-label="Send">
        <Send aria-hidden size={16} strokeWidth={1.75} />
        Send
      </Button>
    </form>
  );
}

export function PauseButton({ phone, paused }: { phone: string; paused: boolean }) {
  const { pending, go } = useAction();
  return (
    <Button size="sm" variant={paused ? "primary" : "secondary"} disabled={pending} onClick={() => go(() => setChatPaused({ phone, paused: !paused }))}>
      {paused ? <Play aria-hidden size={14} strokeWidth={1.75} /> : <Pause aria-hidden size={14} strokeWidth={1.75} />}
      {paused ? "Resume Lingo" : "Pause Lingo"}
    </Button>
  );
}

/** Edit an order's details and status (Inbox side panel, Orders). */
export function OrderEditor({ order, onSaved }: { order: OrderRow; onSaved?: () => void }) {
  const [v, setV] = useState({
    name: order.name ?? "",
    address: order.address ?? "",
    contact: order.contact ?? "",
    qty: String(order.qty),
    status: order.status,
    delivery_status: order.delivery_status ?? "",
    cancel_reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, go } = useAction();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await go(() => saveOrder({ id: order.id, ...v, delivery_status: v.delivery_status as "" | "dispatched" | "delivered" | "returned", status: v.status }));
        setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
        if (r.ok) onSaved?.();
      }}
    >
      <Field label="Name" error={errors.name}><Input value={v.name} onChange={set("name")} maxLength={80} /></Field>
      <Field label="Address" error={errors.address}><Textarea rows={2} value={v.address} onChange={set("address")} maxLength={300} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" error={errors.contact}><Input value={v.contact} onChange={set("contact")} maxLength={40} inputMode="tel" /></Field>
        <Field label="Quantity" error={errors.qty}><Input type="number" min={1} max={99} value={v.qty} onChange={set("qty")} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Order">
          <Select value={v.status} onChange={set("status")} options={[{ value: "draft", label: "Not confirmed" }, { value: "confirmed", label: "Confirmed" }, { value: "cancelled", label: "Cancelled" }]} />
        </Field>
        <Field label="Delivery">
          <Select value={v.delivery_status} onChange={set("delivery_status")} placeholder="Not sent yet" options={[{ value: "dispatched", label: "Dispatched" }, { value: "delivered", label: "Delivered" }, { value: "returned", label: "Returned" }]} />
        </Field>
      </div>
      {v.status === "cancelled" && order.status !== "cancelled" ? (
        <Field label="Why cancelled" hint="Optional, for your records."><Input value={v.cancel_reason} onChange={set("cancel_reason")} maxLength={300} /></Field>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">Save order</Button>
    </form>
  );
}

export function OrderDialogButton({ order }: { order: OrderRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Edit</Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Order #${order.id}`} description={`${order.product_name ?? "Product"} · ${order.phone}`}>
        <OrderEditor order={order} onSaved={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
