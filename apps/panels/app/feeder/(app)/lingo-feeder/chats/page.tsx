import { Card, EmptyState, Input } from "@retexia/ui";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/feeder/lingo-feeder/common";
import { chats, home, lingoFeederContext } from "@/lib/feeder/lingo-feeder/data";
import { STATUS, STATUS_ORDER, showPhone, statusOf, timeAgo } from "@/lib/feeder/lingo-feeder/labels";

export const metadata = { title: "Chats · Lingo Feeder" };

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { ctx } = await lingoFeederContext("/lingo-feeder/chats");
  if (!ctx) return null;
  const sp = await searchParams;
  const status = sp.status && (sp.status in STATUS || sp.status === "all") ? sp.status : "all";
  const q = (sp.q ?? "").trim().slice(0, 60) || null;
  const [list, h] = await Promise.all([chats(ctx.userId, status, q), home(ctx.userId)]);
  const counts = { ...h.statuses, call: h.call } as Record<string, number>;
  const all = Object.entries(h.statuses).filter(([k]) => k !== "spam").reduce((a, [, n]) => a + Number(n), 0);
  const chip = (k: string, label: string, n: number) => (
    <Link
      key={k}
      href={`/lingo-feeder/chats${k === "all" ? "" : `?status=${k}`}`}
      aria-current={status === k ? "page" : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 type-small focus-visible:focus-ring ${status === k ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface-raised text-ink-muted hover:text-ink"}`}
    >
      {label}
      <span className="type-small">{n}</span>
    </Link>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chip("all", "All", all)}
        {STATUS_ORDER.map((k) => chip(k, (k === "call" ? "📞 " : "") + statusOf(k).short, Number(counts[k] ?? 0)))}
      </div>
      <form className="flex gap-2" action="/lingo-feeder/chats">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <Input name="q" defaultValue={q ?? ""} placeholder="Search a name or phone number" aria-label="Search chats" className="max-w-sm" />
      </form>
      {list.length ? (
        <Card padded={false}>
          <ul className="flex flex-col divide-y divide-line">
            {list.map((c) => (
              <li key={c.phone}>
                <Link href={`/lingo-feeder/chats/${c.phone}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-sunk focus-visible:focus-ring">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunk type-label text-ink-muted">
                    {(c.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="type-label text-ink">{c.name || showPhone(c.phone)}</span>
                      <StatusBadge status={c.status} call={c.needs_call} />
                      {c.orders ? <span className="type-small text-success">{c.orders} order{c.orders === 1 ? "" : "s"}</span> : null}
                    </span>
                    <span className="truncate type-small text-ink-muted">
                      {c.last ? `${c.last.role === "c" ? "" : c.last.role === "s" ? "You: " : "Lingo: "}${c.last.content}` : "—"}
                    </span>
                    {c.needs_call && c.call_reason ? <span className="truncate type-small text-danger">{c.call_reason}</span> : c.product ? <span className="truncate type-small text-ink-muted">{c.product}</span> : null}
                  </span>
                  <span className="shrink-0 type-small text-ink-muted">{timeAgo(c.last_msg_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<MessageCircle aria-hidden size={22} strokeWidth={1.5} />} title={q ? "No chats found" : "No chats here yet"}>
          {status === "all" ? "Chats appear here as soon as customers message your WhatsApp number." : statusOf(status).hint}
        </EmptyState>
      )}
    </div>
  );
}
