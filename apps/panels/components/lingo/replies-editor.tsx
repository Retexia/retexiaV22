"use client";

import { Badge, Button, Card, cn } from "@retexia/ui";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { resetReply, saveReply } from "@/app/lingo/actions";
import type { Lang } from "@/lib/lingo/db.types";
import { LANG_LABEL, PLACEHOLDERS } from "@/lib/lingo/labels";

export type ReplyEntry = { key: string; label: string; group: string; texts: Partial<Record<string, { global: string | null; own: string | null }>> };

export function RepliesEditor({ entries, languages }: { entries: ReplyEntry[]; languages: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(entries[0]?.key ?? "");
  const [lang, setLang] = useState(languages[0] ?? "si");
  const current = entries.find((e) => e.key === selected);
  const t = current?.texts[lang];
  const [draft, setDraft] = useState<string>(t?.own ?? t?.global ?? "");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const groups = [...new Set(entries.map((e) => e.group))];

  const pick = (key: string, l = lang) => {
    const e = entries.find((x) => x.key === key);
    setSelected(key);
    setLang(l);
    setDraft(e?.texts[l]?.own ?? e?.texts[l]?.global ?? "");
  };
  const insert = (p: string) => {
    const el = ref.current;
    const token = `{${p}}`;
    if (!el) return setDraft((d) => d + token);
    const start = el.selectionStart;
    const next = draft.slice(0, start) + token + draft.slice(el.selectionEnd);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card padded={false} className="self-start">
        <nav aria-label="Replies" className="flex max-h-[70vh] flex-col overflow-y-auto py-2">
          {groups.map((g) => (
            <div key={g} className="flex flex-col">
              <span className="px-4 pt-3 pb-1 type-caption text-ink-muted">{g}</span>
              {entries
                .filter((e) => e.group === g)
                .map((e) => {
                  const custom = Object.values(e.texts).some((x) => x?.own);
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => pick(e.key)}
                      aria-current={selected === e.key ? "true" : undefined}
                      className={cn("flex items-center justify-between gap-2 px-4 py-2 text-left type-small focus-visible:focus-ring", selected === e.key ? "bg-brand-soft text-brand" : "text-ink hover:bg-surface-sunk")}
                    >
                      <span className="truncate">{e.label}</span>
                      {custom ? <Badge tone="brand">Yours</Badge> : null}
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>
      </Card>
      {current ? (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="type-h2 text-ink">{current.label}</h2>
            <code className="type-caption text-ink-muted">{current.key}</code>
          </div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Language">
            {languages.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => pick(current.key, l)}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 type-label", lang === l ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk")}
              >
                {LANG_LABEL[l as Lang] ?? l}
                {current.texts[l]?.own ? <span aria-hidden className="size-1.5 rounded-full bg-brand" /> : null}
              </button>
            ))}
          </div>
          <textarea
            ref={ref}
            aria-label={`${current.label} in ${LANG_LABEL[lang as Lang] ?? lang}`}
            rows={8}
            value={draft}
            maxLength={3000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t?.global ? "" : "No default text for this language yet. Write your own."}
            className="w-full rounded-md border border-line-strong bg-surface-raised p-3 type-body text-ink focus-visible:border-brand focus-visible:focus-ring"
          />
          <div className="flex flex-col gap-2">
            <span className="type-caption text-ink-muted">Insert:</span>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((p) => (
                <button key={p} type="button" onClick={() => insert(p)} className="rounded-full border border-line px-2 py-0.5 type-caption text-ink-muted hover:border-brand hover:text-ink focus-visible:focus-ring">
                  {`{${p}}`}
                </button>
              ))}
            </div>
          </div>
          <p className="type-small text-ink-muted">{t?.own ? "Lingo uses your version." : t?.global ? "Lingo uses the Retexia default. Save to use your own wording." : "There's no text yet; Lingo falls back to another language."}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              loading={busy}
              disabled={!draft.trim() || draft === (t?.own ?? t?.global ?? "")}
              onClick={async () => {
                setBusy(true);
                const r = await saveReply({ key: current.key, language: lang, content: draft });
                setBusy(false);
                toast[r.ok ? "success" : "error"](r.message ?? "");
                if (r.ok) router.refresh();
              }}
            >
              Save my version
            </Button>
            {t?.own ? (
              <Button
                variant="ghost"
                icon={<RotateCcw aria-hidden size={14} strokeWidth={1.5} />}
                onClick={async () => {
                  const r = await resetReply({ key: current.key, language: lang });
                  toast[r.ok ? "success" : "error"](r.message ?? "");
                  if (r.ok) {
                    setDraft(t.global ?? "");
                    router.refresh();
                  }
                }}
              >
                Use the default
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
