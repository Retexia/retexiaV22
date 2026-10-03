import { cn } from "@retexia/ui";
import { CheckCheck } from "lucide-react";

export type ChatMessage = { from: "customer" | "business"; text: string; time?: string };

const FALLBACK_CHAT: { name: string; status: string; messages: ChatMessage[] } = {
  name: "Your business",
  status: "Replies instantly",
  messages: [
    { from: "customer", text: "Hi, is this available in size M?", time: "9:41 pm" },
    { from: "business", text: "Yes, size M is in stock. It is Rs. 4,850 with next-day delivery in Colombo.", time: "9:41 pm" },
    { from: "customer", text: "How do I order?", time: "9:42 pm" },
    { from: "business", text: "Send your name, address and phone number. Cash on delivery is fine.", time: "9:42 pm" },
  ],
};

/**
 * Coded mock of a WhatsApp chat in a phone-shaped card (decorative: the
 * conversation is also exposed as a plain list for screen readers).
 */
export function ChatMock({
  chat,
  label,
  customerLabel = "Customer",
  showHalo = true,
}: {
  chat?: { name?: string; status?: string; messages: ChatMessage[] };
  label: string;
  customerLabel?: string;
  showHalo?: boolean;
}) {
  const data = { ...FALLBACK_CHAT, ...(chat ?? {}) };
  const initial = (data.name ?? "").trim().charAt(0).toUpperCase() || "R";
  return (
    <figure className="relative mx-auto w-full max-w-[340px]" aria-label={label}>
      {showHalo ? (
        <>
          <div aria-hidden className="absolute -top-10 -right-16 size-56 rounded-full bg-brand-halo opacity-80 blur-[2px] sm:-right-28 sm:size-72" />
          <div aria-hidden className="absolute -bottom-8 -left-16 size-40 rounded-full bg-brand-halo opacity-70 blur-[2px] sm:-left-28 sm:size-56" />
        </>
      ) : null}
      <div className="relative overflow-hidden rounded-[28px] border border-line bg-surface-raised shadow-float">
        <div className="flex items-center gap-3 border-b border-line bg-surface-sunk px-4 py-3">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-full bg-accent-soft font-display text-[15px] text-accent"
          >
            {initial}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate type-label text-ink">{data.name}</span>
            <span className="flex items-center gap-1.5 type-small text-ink-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              {data.status}
            </span>
          </div>
        </div>
        <ol className="flex flex-col gap-2 px-3 py-4 sm:px-4">
          {data.messages.map((m, i) => {
            const mine = m.from === "business";
            return (
              <li key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 type-body",
                    mine
                      ? "rounded-br-md bg-accent-soft text-ink"
                      : "rounded-bl-md border border-line bg-surface text-ink",
                  )}
                >
                  <span className="sr-only">{mine ? `${data.name}: ` : `${customerLabel}: `}</span>
                  <span className="whitespace-pre-line">{m.text}</span>
                  {m.time ? (
                    <span aria-hidden className="mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-4 text-ink-muted">
                      {m.time}
                      {mine ? <CheckCheck size={12} strokeWidth={1.75} className="text-accent" /> : null}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </figure>
  );
}
