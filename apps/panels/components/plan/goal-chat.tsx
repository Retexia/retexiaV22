"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { Button, Card, Switch, Textarea } from "@retexia/ui";
import { Bot, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchMessages, sendMessage } from "@/app/plan/actions";
import type { ChatMessage } from "@/lib/plan/data";

const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * A goal's live chat: the people of the goal and the Retexia AI coach.
 * New messages arrive live (Supabase Realtime), with a light poll as backup.
 */
export function GoalChat({ goalId, me, initial, names, coachFirst }: { goalId: string; me: string; initial: ChatMessage[]; names: Record<string, string>; coachFirst: boolean }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [askCoach, setAskCoach] = useState(coachFirst);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1]?.created_at ?? new Date(0).toISOString();
  const lastRef = useRef(last);
  useEffect(() => {
    lastRef.current = last;
  }, [last]);

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const add = incoming.filter((m) => !seen.has(m.id));
      if (add.some((m) => m.kind === "coach")) setThinking(false);
      return add.length ? [...cur, ...add].sort((a, b) => a.created_at.localeCompare(b.created_at)) : cur;
    });
  }, []);

  // Live: Realtime on plan.messages (RLS: only this goal's people get them).
  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`plan-goal-${goalId}`)
      .on("postgres_changes", { event: "INSERT", schema: "plan", table: "messages", filter: `goal_id=eq.${goalId}` }, (payload) => {
        const m = payload.new as Omit<ChatMessage, "author">;
        merge([{ ...m, author: m.kind === "coach" ? "Retexia coach" : (names[m.author_id ?? ""] ?? "Someone") }]);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [goalId, merge, names]);

  // Backup: ask for new messages (often while the coach is thinking, otherwise now and then).
  useEffect(() => {
    const id = setInterval(
      async () => {
        if (document.hidden) return;
        const r = await fetchMessages({ goal_id: goalId, after: lastRef.current });
        if (r.ok && r.data) merge(r.data.messages);
      },
      thinking ? 3000 : 15000,
    );
    return () => clearInterval(id);
  }, [goalId, merge, thinking]);

  useEffect(() => {
    if (!thinking) return;
    const id = setTimeout(() => setThinking(false), 120_000);
    return () => clearTimeout(id);
  }, [thinking]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    const r = await sendMessage({ goal_id: goalId, body, askCoach });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    setText("");
    if (r.data) merge([r.data.message]);
    if (askCoach) setThinking(true);
  }

  return (
    <Card className="flex h-[640px] max-h-[80vh] flex-col gap-3" padded={false}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="type-h3 text-ink">Chat</h2>
        <Switch checked={askCoach} onCheckedChange={setAskCoach} label="Ask the coach" />
      </div>
      <div ref={list} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4" aria-live="polite">
        {messages.length ? (
          messages.map((m) => {
            const mine = m.kind === "user" && m.author_id === me;
            const coach = m.kind === "coach";
            return (
              <div key={m.id} className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                <span className="flex items-center gap-1 type-caption text-ink-muted">
                  {coach ? <Bot aria-hidden size={12} strokeWidth={1.5} /> : null}
                  {mine ? "You" : m.author} · {time(m.created_at)}
                </span>
                <div
                  className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 type-body ${
                    mine ? "rounded-br-sm bg-brand text-on-brand" : coach ? "rounded-bl-sm border border-brand/20 bg-brand-soft text-ink" : "rounded-bl-sm bg-surface-sunk text-ink"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            );
          })
        ) : (
          <div className="m-auto flex max-w-xs flex-col items-center gap-2 text-center">
            <Bot aria-hidden size={28} strokeWidth={1.5} className="text-brand" />
            <p className="type-body text-ink-muted">Ask the Retexia coach anything about this goal: &quot;Am I on track?&quot;, &quot;How do I catch up?&quot;, &quot;Plan my week&quot;. People you invite can chat here too.</p>
          </div>
        )}
        {thinking ? (
          <div className="flex items-center gap-2 type-small text-ink-muted">
            <Bot aria-hidden size={14} strokeWidth={1.5} />
            Coach is thinking
            <span className="rx-line-track" style={{ width: 48 }}>
              <span className="rx-line-seg" />
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex items-end gap-2 border-t border-line p-3">
        <Textarea
          rows={2}
          value={text}
          maxLength={4000}
          placeholder={askCoach ? "Ask the coach…" : "Message the people of this goal…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className="min-h-0 flex-1"
          aria-label="Message"
        />
        <Button loading={busy} onClick={send} disabled={!text.trim()} icon={<Send aria-hidden size={16} strokeWidth={1.5} />}>
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </Card>
  );
}
