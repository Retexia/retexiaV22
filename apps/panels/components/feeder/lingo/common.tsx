"use client";

import { LinkTabs } from "@retexia/ui/admin";
import { Switch } from "@retexia/ui";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { setBotOn } from "@/app/feeder/(app)/lingo/actions";

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
  { href: "/lingo", label: "Dashboard", exact: true },
  { href: "/lingo/inbox", label: "Inbox" },
  { href: "/lingo/orders", label: "Orders" },
  { href: "/lingo/products", label: "Products" },
  { href: "/lingo/faqs", label: "FAQs" },
  { href: "/lingo/ads", label: "Ads" },
  { href: "/lingo/messages", label: "Messages & buttons" },
  { href: "/lingo/test", label: "Test bot" },
  { href: "/lingo/settings", label: "Settings" },
  { href: "/lingo/connect", label: "WhatsApp" },
];

/** Lingo's own tabs (feeder.retexia.com/lingo/…). */
export function LingoNav({ needs, toExport }: { needs: number; toExport: number }) {
  const path = usePathname().replace(/^\/feeder/, "");
  return (
    <LinkTabs
      label="Lingo"
      items={TABS.map((t) => ({
        href: t.href,
        label: t.label,
        active: t.exact ? path === t.href : path.startsWith(t.href),
        count: t.href === "/lingo/inbox" && needs ? needs : t.href === "/lingo/orders" && toExport ? toExport : null,
      }))}
    />
  );
}

/** Lingo on / off for the whole number. */
export function BotSwitch({ on }: { on: boolean }) {
  const [checked, setChecked] = useState(on);
  const { pending, go } = useAction();
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-surface-raised px-4 py-2">
      <Switch
        checked={checked}
        disabled={pending}
        label={checked ? "Lingo is answering" : "Lingo is off"}
        onCheckedChange={async (v) => {
          const r = await go(() => setBotOn(v));
          if (r.ok) setChecked(v);
        }}
      />
    </div>
  );
}

/** WhatsApp's *bold* and _italic_ in a preview. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, i) =>
    /^\*[^*]+\*$/.test(part) ? <strong key={i}>{part.slice(1, -1)}</strong> : /^_[^_]+_$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : <span key={i}>{part}</span>,
  );
}

/** One WhatsApp message as the customer sees it (text, photo + caption, buttons or a list). */
export function WaBubble({ text, image, buttons, list, customer = false, meta }: { text?: string; image?: string | null; buttons?: string[]; list?: string; customer?: boolean; meta?: ReactNode }) {
  return (
    <div className={`flex max-w-[85%] flex-col gap-1 ${customer ? "self-start" : "self-end"}`}>
      <div className={`overflow-hidden rounded-lg border border-line shadow-soft ${customer ? "bg-surface-raised" : "bg-success-soft"}`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- seller's own public product photo
          <img src={image} alt="" className="max-h-64 w-full object-cover" />
        ) : null}
        {text ? <p className="px-3 py-2 type-body whitespace-pre-wrap break-words text-ink">{rich(text)}</p> : null}
        {buttons?.length ? (
          <div className="flex flex-col border-t border-line">
            {buttons.map((b) => (
              <span key={b} className="border-b border-line px-3 py-2 text-center type-label text-brand last:border-b-0">{b}</span>
            ))}
          </div>
        ) : null}
        {list ? <span className="block border-t border-line px-3 py-2 text-center type-label text-brand">☰ {list}</span> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2 px-1 type-small text-ink-muted">{meta}</div> : null}
    </div>
  );
}

/** A Graph API message body (as Lingo sends it) → a preview bubble. */
export function BodyBubble({ body, meta }: { body: Record<string, unknown>; meta?: ReactNode }) {
  const b = body as { type?: string; text?: { body?: string }; image?: { link?: string; caption?: string }; interactive?: { type?: string; body?: { text?: string }; action?: { buttons?: { reply: { title: string } }[]; button?: string } } };
  if (b.type === "image") return <WaBubble image={b.image?.link} text={b.image?.caption} meta={meta} />;
  if (b.type === "interactive")
    return (
      <WaBubble
        text={b.interactive?.body?.text}
        buttons={b.interactive?.type === "button" ? (b.interactive.action?.buttons ?? []).map((x) => x.reply.title) : undefined}
        list={b.interactive?.type === "list" ? b.interactive.action?.button : undefined}
        meta={meta}
      />
    );
  return <WaBubble text={b.text?.body} meta={meta} />;
}
