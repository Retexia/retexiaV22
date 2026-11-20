import { Badge, Card, EmptyState } from "@retexia/ui";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { WaBubble } from "@/components/feeder/lingo/common";
import { OrderEditor, PauseButton, RateButtons, ReplyBox } from "@/components/feeder/lingo/inbox";
import { chat, inbox, lingoContext } from "@/lib/feeder/lingo/data";
import { LANG, money, ROUTE, showPhone, STAGE, timeAgo, windowOpen } from "@/lib/feeder/lingo/labels";

export const metadata = { title: "Inbox · Lingo" };

const FILTERS = [
  { key: "needs", label: "Needs you" },
  { key: "ordering", label: "Ordering" },
  { key: "ordered", label: "Ordered" },
  { key: "all", label: "All" },
];

/** A bot message's text without the "[photo]" marker Lingo stores. */
function parseBot(content: string) {
  const photo = content.startsWith("[photo]");
  const body = photo ? content.slice(7).trim() : content;
  const m = /\n\[([^\]]+)\]$/.exec(body);
  return { photo, text: m ? body.slice(0, m.index) : body, buttons: m ? m[1]!.split(" | ") : undefined };
}

export default async function LingoInbox({ searchParams }: { searchParams: Promise<{ f?: string; c?: string }> }) {
  const { ctx } = await lingoContext("/lingo/inbox");
  if (!ctx) return null;
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.key === sp.f) ? sp.f! : "all";
  const phone = /^\d{6,20}$/.test(sp.c ?? "") ? sp.c! : null;
  const [list, open] = await Promise.all([inbox(ctx.id, filter), phone ? chat(ctx.id, phone) : Promise.resolve(null)]);
  const q = (f: string, c?: string) => `/lingo/inbox?f=${f}${c ? `&c=${c}` : ""}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={`flex flex-col gap-3 ${open ? "hidden lg:flex" : ""}`}>
        <nav aria-label="Chat filter" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link key={f.key} href={q(f.key)} aria-current={filter === f.key ? "page" : undefined}
              className={`rounded-full border px-3 py-1 type-small transition-hover focus-visible:focus-ring ${filter === f.key ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-muted hover:text-ink"}`}>
              {f.label}
            </Link>
          ))}
        </nav>
        {list.length ? (
          <ul className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface-raised">
            {list.map((c) => (
              <li key={c.phone} className="border-b border-line last:border-b-0">
                <Link href={q(filter, c.phone)} aria-current={phone === c.phone ? "true" : undefined}
                  className={`flex flex-col gap-1 px-4 py-3 transition-hover focus-visible:focus-ring ${phone === c.phone ? "bg-brand-soft" : "hover:bg-surface-sunk"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate type-label text-ink">{c.name || showPhone(c.phone)}</span>
                    <span className="shrink-0 type-small text-ink-muted">{timeAgo(c.last_msg_at)}</span>
                  </span>
                  <span className="truncate type-small text-ink-muted">{c.last ? `${c.last.role === "c" ? "" : c.last.role === "seller" ? "You: " : "Lingo: "}${c.last.content.replace(/^\[photo\]\s*/, "📷 ")}` : "—"}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={c.needs_seller ? "danger" : (STAGE[c.stage]?.tone ?? "neutral")}>{c.needs_seller ? "Needs you" : (STAGE[c.stage]?.label ?? c.stage)}</Badge>
                    {c.product ? <span className="truncate type-small text-ink-muted">{c.product}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<MessagesSquare aria-hidden size={22} strokeWidth={1.5} />} title={filter === "needs" ? "Nothing needs you" : "No chats yet"}>{filter === "needs" ? "Chats Lingo hands to you show up here." : "Chats from your Click-to-WhatsApp ads show up here."}</EmptyState>
        )}
      </aside>

      {open ? (
        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="flex min-w-0 flex-col gap-4" padded={false}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Link href={q(filter)} className="rounded-full p-1 text-ink-muted hover:text-ink focus-visible:focus-ring lg:hidden" aria-label="Back to chats">
                  <ArrowLeft aria-hidden size={18} strokeWidth={1.5} />
                </Link>
                <div className="min-w-0">
                  <p className="truncate type-h3 text-ink">{open.customer.name || showPhone(phone!)}</p>
                  <p className="type-small text-ink-muted">{showPhone(phone!)} · {LANG[open.customer.lang] ?? open.customer.lang}{open.customer.ad_id ? " · from an ad" : ""}</p>
                </div>
              </div>
              <PauseButton phone={phone!} paused={Boolean(open.customer.paused_until && new Date(open.customer.paused_until) > new Date())} />
            </header>
            {open.customer.needs_seller ? (
              <p className="mx-4 rounded-md bg-danger-soft px-3 py-2 type-small text-ink">Handed to you{open.customer.handoff_reason ? `: ${open.customer.handoff_reason}` : ""}. Reply here or in WhatsApp, then press Resume Lingo.</p>
            ) : null}
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-4">
              {open.messages.map((m) => {
                if (m.role === "c") return <WaBubble key={m.id} customer text={m.content} meta={<span>{timeAgo(m.created_at)}</span>} />;
                const b = parseBot(m.content);
                const r = m.route ? ROUTE[m.route] : null;
                return (
                  <WaBubble
                    key={m.id}
                    text={b.text}
                    image={b.photo ? (open.product?.image_url ?? null) : null}
                    buttons={b.buttons}
                    meta={
                      <>
                        <span>{m.role === "seller" ? "You" : "Lingo"} · {timeAgo(m.created_at)}{m.status ? ` · ${m.status}` : ""}</span>
                        {r ? <span title={r.hint}><Badge tone="neutral">{r.label}</Badge></span> : null}
                        {m.role === "b" && m.route ? <RateButtons id={m.id} rating={m.rating} correction={m.correction} /> : null}
                      </>
                    }
                  />
                );
              })}
            </div>
            <div className="border-t border-line p-4">
              <ReplyBox phone={phone!} open={windowOpen(open.customer.last_in_at)} />
            </div>
          </Card>
          <aside className="flex flex-col gap-4">
            <Card className="flex flex-col gap-2">
              <h2 className="type-h3 text-ink">Product</h2>
              {open.product ? (
                <>
                  <p className="type-body text-ink">{open.product.name}</p>
                  <p className="type-small text-ink-muted">{money(open.product.price)} + delivery {money(open.product.delivery_fee)}</p>
                </>
              ) : (
                <p className="type-small text-ink-muted">Not known yet.</p>
              )}
              <p className="type-small text-ink-muted">Stage: {STAGE[open.customer.stage]?.label ?? open.customer.stage}</p>
            </Card>
            <Card className="flex flex-col gap-3">
              <h2 className="type-h3 text-ink">Order</h2>
              {open.order ? (
                <>
                  <p className="type-small text-ink-muted">
                    #{open.order.id} · {open.order.product_name} × {open.order.qty} · {money(open.order.total)}
                    {open.order.feeder_sync === "done" ? " · in a courier file" : ""}
                  </p>
                  <OrderEditor key={`${open.order.id}-${open.order.updated_at}`} order={open.order} />
                </>
              ) : (
                <p className="type-small text-ink-muted">No order yet.</p>
              )}
            </Card>
          </aside>
        </section>
      ) : (
        <Card className="hidden items-center justify-center py-16 text-center lg:flex">
          <p className="type-body text-ink-muted">Pick a chat to read it.</p>
        </Card>
      )}
    </div>
  );
}
