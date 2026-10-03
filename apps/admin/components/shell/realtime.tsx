"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Event = { id: string; title: string; detail?: string; href: string; at: number };

/**
 * Live updates without reloading: new requests, messages, payment proofs and
 * finished product actions show a toast, land in the bell and refresh counts.
 */
export function RealtimeBell() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    const push = (e: Omit<Event, "id" | "at">) => {
      const event = { ...e, id: `${Date.now()}-${Math.random()}`, at: Date.now() };
      setEvents((list) => [event, ...list].slice(0, 20));
      setUnread((n) => n + 1);
      toast(e.title, { description: e.detail, action: { label: "Open", onClick: () => router.push(e.href) } });
      router.refresh();
    };
    const channel = supabase
      .channel("admin-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const ref = (payload.new as { ref?: string }).ref ?? "";
        push({ title: `New request ${ref}`, detail: "Submitted just now", href: `/requests/${encodeURIComponent(ref)}` });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contact_messages" }, (payload) => {
        const m = payload.new as { id: string; name?: string };
        push({ title: "New message", detail: m.name ? `From ${m.name}` : undefined, href: `/inbox?open=${m.id}` });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments" }, (payload) => {
        const p = payload.new as { status?: string; proof_path?: string | null };
        if (p.status === "pending" && p.proof_path) push({ title: "Payment proof uploaded", href: "/payments?tab=proofs" });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "action_runs" }, (payload) => {
        const r = payload.new as { status?: string; action_label?: string; order_id?: string };
        if (r.status === "succeeded" || r.status === "failed") {
          push({ title: `${r.action_label ?? "Action"} ${r.status}`, href: `/requests?order=${r.order_id ?? ""}` });
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setUnread(0);
        }}
        className="relative inline-flex size-9 items-center justify-center rounded-full text-ink-muted transition-hover hover:bg-surface-sunk hover:text-ink focus-visible:focus-ring"
      >
        <Bell aria-hidden size={18} strokeWidth={1.5} />
        {unread ? <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger" /> : null}
        <span className="sr-only">{unread ? `Notifications, ${unread} new` : "Notifications"}</span>
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-line bg-surface-raised p-2 shadow-float" role="region" aria-label="Notifications">
          {events.length ? (
            <ul className="flex flex-col">
              {events.map((e) => (
                <li key={e.id}>
                  <Link href={e.href} onClick={() => setOpen(false)} className="flex flex-col rounded-md px-3 py-2 hover:bg-surface-sunk focus-visible:focus-ring">
                    <span className="type-label text-ink">{e.title}</span>
                    <span className="type-small text-ink-muted">
                      {e.detail ? `${e.detail} · ` : ""}
                      {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center type-body text-ink-muted">Nothing new since you opened the admin.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
