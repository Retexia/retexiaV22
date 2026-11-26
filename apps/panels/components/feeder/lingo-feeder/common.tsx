"use client";

import { Badge, Switch } from "@retexia/ui";
import { LinkTabs } from "@retexia/ui/admin";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { setLingoOn } from "@/app/feeder/(app)/lingo-feeder/actions";
import { STATUS, statusOf } from "@/lib/feeder/lingo-feeder/labels";

type Result<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** Runs a server action with a toast and a refresh; returns the result. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = <T,>(fn: () => Promise<Result<T>>, opts: { quiet?: boolean; refresh?: boolean } = {}) =>
    new Promise<Result<T>>((resolve) => {
      start(async () => {
        const r = await fn();
        if (!r.ok) toast.error(r.message);
        else if (r.message && !opts.quiet) toast.success(r.message);
        if (r.ok && opts.refresh !== false) router.refresh();
        resolve(r);
      });
    });
  return { pending, go };
}

const TABS = [
  { href: "/lingo-feeder", label: "Home", exact: true },
  { href: "/lingo-feeder/chats", label: "Chats" },
  { href: "/lingo-feeder/orders", label: "Orders" },
  { href: "/lingo-feeder/products", label: "Products" },
  { href: "/lingo-feeder/business", label: "Business details" },
  { href: "/lingo-feeder/whatsapp", label: "WhatsApp" },
  { href: "/lingo-feeder/try", label: "Try Lingo" },
];

/** Lingo Feeder's own tabs. */
export function LfNav({ call, toExport }: { call: number; toExport: number }) {
  const path = usePathname().replace(/^\/feeder/, "");
  return (
    <LinkTabs
      label="Lingo Feeder"
      items={TABS.map((t) => ({
        href: t.href,
        label: t.label,
        active: t.exact ? path === t.href : path.startsWith(t.href),
        count: t.href === "/lingo-feeder/chats" && call ? call : t.href === "/lingo-feeder/orders" && toExport ? toExport : null,
      }))}
    />
  );
}

/** Lingo on / off for the whole number. */
export function LingoSwitch({ on }: { on: boolean }) {
  const [checked, setChecked] = useState(on);
  const { pending, go } = useAction();
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-surface-raised px-4 py-2">
      <Switch
        checked={checked}
        disabled={pending}
        label={checked ? "Lingo is answering" : "Lingo is off"}
        onCheckedChange={async (v) => {
          const r = await go(() => setLingoOn(v));
          if (r.ok) setChecked(v);
        }}
      />
    </div>
  );
}

export function StatusBadge({ status, call }: { status: string; call?: boolean }) {
  if (call) return <Badge tone="danger">📞 {STATUS.call.short}</Badge>;
  const s = statusOf(status);
  return <Badge tone={s.tone}>{s.short}</Badge>;
}

/** WhatsApp's *bold* and _italic_. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, i) =>
    /^\*[^*]+\*$/.test(part) ? <strong key={i}>{part.slice(1, -1)}</strong> : /^_[^_]+_$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : <span key={i}>{part}</span>,
  );
}

/** One WhatsApp message as the customer sees it (text, photo + caption, buttons or a list). */
export function Bubble({
  text, image, buttons, list, side = "out", tone = "lingo", meta, onTap,
}: {
  text?: string; image?: string | null; buttons?: { id?: string; title: string }[]; list?: { button: string; rows: { id?: string; title: string; description?: string }[] };
  side?: "in" | "out"; tone?: "lingo" | "seller" | "customer"; meta?: ReactNode; onTap?: (t: { id: string; title: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const bg = tone === "customer" ? "bg-surface-raised" : tone === "seller" ? "bg-brand-soft" : "bg-success-soft";
  return (
    <div className={`flex max-w-[88%] flex-col gap-1 sm:max-w-[75%] ${side === "in" ? "self-start" : "self-end"}`}>
      <div className={`overflow-hidden rounded-lg border border-line shadow-soft ${bg}`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- public product photo
          <img src={image} alt="" className="max-h-72 w-full object-cover" />
        ) : null}
        {text ? <p className="px-3 py-2 type-body whitespace-pre-wrap break-words text-ink">{rich(text)}</p> : null}
        {buttons?.length ? (
          <div className="flex flex-col border-t border-line">
            {buttons.map((b, i) =>
              onTap && b.id ? (
                <button key={i} type="button" onClick={() => onTap({ id: b.id!, title: b.title })} className="border-b border-line px-3 py-2 text-center type-label text-brand last:border-b-0 hover:bg-surface-sunk focus-visible:focus-ring">
                  {b.title}
                </button>
              ) : (
                <span key={i} className="border-b border-line px-3 py-2 text-center type-label text-brand last:border-b-0">{b.title}</span>
              ),
            )}
          </div>
        ) : null}
        {list ? (
          <div className="border-t border-line">
            <button type="button" onClick={() => setOpen(!open)} className="block w-full px-3 py-2 text-center type-label text-brand hover:bg-surface-sunk focus-visible:focus-ring">☰ {list.button}</button>
            {open ? (
              <ul className="flex flex-col border-t border-line bg-surface-raised">
                {list.rows.map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={!onTap || !r.id}
                      onClick={() => r.id && onTap?.({ id: r.id, title: r.title })}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-line px-3 py-2 text-left last:border-b-0 enabled:hover:bg-surface-sunk focus-visible:focus-ring"
                    >
                      <span className="type-label text-ink">{r.title}</span>
                      {r.description ? <span className="type-small text-ink-muted">{r.description}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {meta ? <div className={`flex flex-wrap items-center gap-2 px-1 type-small text-ink-muted ${side === "in" ? "" : "justify-end"}`}>{meta}</div> : null}
    </div>
  );
}

type GraphBody = {
  type?: string; text?: { body?: string }; image?: { link?: string; caption?: string };
  interactive?: { type?: string; body?: { text?: string }; action?: { buttons?: { reply: { id: string; title: string } }[]; button?: string; sections?: { rows: { id: string; title: string; description?: string }[] }[] } };
};
/** A Graph API message body (as Lingo sends it) → a bubble. */
export function BodyBubble({ body, meta, onTap }: { body: Record<string, unknown>; meta?: ReactNode; onTap?: (t: { id: string; title: string }) => void }) {
  const b = body as GraphBody & { reaction?: { emoji?: string } };
  if (b.type === "reaction") return <p className="self-start px-2 type-small text-ink-muted">Lingo reacted {b.reaction?.emoji} to the message</p>;
  if (b.type === "image") return <Bubble image={b.image?.link} text={b.image?.caption} meta={meta} />;
  if (b.type === "interactive") {
    const a = b.interactive?.action;
    return (
      <Bubble
        text={b.interactive?.body?.text}
        buttons={b.interactive?.type === "button" ? (a?.buttons ?? []).map((x) => x.reply) : undefined}
        list={b.interactive?.type === "list" ? { button: a?.button ?? "", rows: a?.sections?.[0]?.rows ?? [] } : undefined}
        meta={meta}
        onTap={onTap}
      />
    );
  }
  return <Bubble text={b.text?.body} meta={meta} />;
}
