"use client";

import { Badge, Button, Card, cn } from "@retexia/ui";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Settings } from "@/lib/post/post-db.types";
import { PlaylistSection, WhatsAppSection } from "./settings-form";

type Step = { key: string; title: string; done: boolean };

/**
 * First visit after paying: set up the daily playlist, WhatsApp messages,
 * Facebook & Instagram, then brand and products. One step open at a time;
 * saving a step opens the next.
 */
export function StartWizard({
  settings,
  limits,
  whatsAppReady,
  canTestWhatsApp,
  done,
  connect,
  brand,
}: {
  settings: Settings;
  limits: { label: string; postsPerDay: number; storiesPerDay: number };
  whatsAppReady: boolean;
  canTestWhatsApp: boolean;
  done: { playlist: boolean; whatsapp: boolean; accounts: boolean; brand: boolean };
  connect: ReactNode;
  brand: ReactNode;
}) {
  const [finished, setFinished] = useState(done);
  const steps: Step[] = [
    { key: "playlist", title: "Daily playlist", done: finished.playlist },
    { key: "whatsapp", title: "WhatsApp messages", done: finished.whatsapp },
    { key: "accounts", title: "Connect Facebook & Instagram", done: finished.accounts },
    { key: "brand", title: "Brand and products", done: finished.brand },
  ];
  const [open, setOpen] = useState(steps.find((s) => !s.done)?.key ?? "brand");
  const next = (key: keyof typeof done) => {
    setFinished((f) => ({ ...f, [key]: true }));
    const order = steps.map((s) => s.key);
    const after = order.slice(order.indexOf(key) + 1).find((k) => !finished[k as keyof typeof done]);
    setOpen(after ?? "brand");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const count = steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="type-small text-ink-muted">
        {count} of {steps.length} done
      </p>
      {steps.map((s, i) => (
        <div key={s.key} className="flex flex-col gap-3">
          <Card padded={false}>
            <button
              type="button"
              onClick={() => setOpen(open === s.key ? "" : s.key)}
              aria-expanded={open === s.key}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-5 py-4 text-left focus-visible:focus-ring"
            >
              <span className="flex items-center gap-3">
                {s.done ? (
                  <CheckCircle2 aria-hidden size={22} strokeWidth={1.5} className="text-success" />
                ) : (
                  <span className="flex size-[22px] items-center justify-center rounded-full border border-line-strong type-caption text-ink-muted">{i + 1}</span>
                )}
                <span className="type-h3 text-ink">{s.title}</span>
                {s.done ? <Badge tone="success">Done</Badge> : null}
              </span>
              <ChevronDown aria-hidden size={18} strokeWidth={1.5} className={cn("text-ink-muted transition-transform", open === s.key && "rotate-180")} />
            </button>
          </Card>
          {open === s.key ? (
            s.key === "playlist" ? (
              <PlaylistSection settings={settings} limits={limits} saveLabel="Save and continue" onSaved={() => next("playlist")} />
            ) : s.key === "whatsapp" ? (
              <div className="flex flex-col gap-3">
                <WhatsAppSection
                  settings={settings}
                  whatsAppReady={whatsAppReady}
                  canTestWhatsApp={canTestWhatsApp}
                  enableByDefault
                  saveLabel="Save and continue"
                  onSaved={() => next("whatsapp")}
                />
              </div>
            ) : s.key === "accounts" ? (
              <div className="flex flex-col gap-3">
                {connect}
                {!finished.accounts ? (
                  <Button variant="ghost" className="self-start" onClick={() => next("accounts")}>
                    Do this later
                  </Button>
                ) : null}
              </div>
            ) : (
              brand
            )
          ) : null}
        </div>
      ))}
    </div>
  );
}
