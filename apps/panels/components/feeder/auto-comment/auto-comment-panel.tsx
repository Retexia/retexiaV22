"use client";

import { Alert, Badge, Button, Card, Field, Input, Switch, Textarea } from "@retexia/ui";
import { StatCard } from "@retexia/ui/admin";
import { EyeOff, MessageCircleReply, MessageSquareText, Pin, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { checkNow, saveCommentSettings, setAutoComment } from "@/app/feeder/(app)/auto-comment/actions";
import type { CommentStatus, LogItem } from "@/lib/feeder/auto-comment/data";
import { decide, LIMITS, type CommentSettings, type Rule } from "@/lib/feeder/auto-comment/rules";

type Result = { ok: true; message?: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<Result>) =>
    new Promise<Result>((resolve) =>
      start(async () => {
        const r = await fn();
        if (r.ok) {
          if (r.message) toast.success(r.message);
          router.refresh();
        } else toast.error(r.message);
        resolve(r);
      }),
    );
  return { pending, go };
}

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const toWords = (s: string) => s.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);

function Section({ title, description, children, aside }: { title: string; description?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="type-h3 text-ink">{title}</h2>
          {description ? <p className="type-small text-ink-muted">{description}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

export function AutoCommentPanel({ status, log, stats }: { status: CommentStatus; log: LogItem[]; stats: { replied: number; private: number; hidden: number; first: number } }) {
  const { pending, go } = useAct();
  const [s, setS] = useState<CommentSettings>(status.settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tryText, setTryText] = useState("Price kiyada? Colombo walata delivery thiyenawada");
  const [tryName, setTryName] = useState("Nimal Perera");
  const set = <K extends keyof CommentSettings>(k: K, v: CommentSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const setRule = (i: number, r: Partial<Rule>) => set("rules", s.rules.map((x, j) => (j === i ? { ...x, ...r } : x)));
  // What the customer typed in the word fields (commas and spaces kept while typing).
  const [raw, setRaw] = useState(() => s.rules.map((r) => r.words.join(", ")));
  const [hideRaw, setHideRaw] = useState(() => s.hide_words.join(", "));
  const trial = useMemo(() => decide(s, { id: "try", message: tryText, author: tryName }), [s, tryText, tryName]);
  const connected = status.page.id && status.page.status === "connected";
  const on = status.settings.enabled;

  const save = async () => {
    const r = await go(() => saveCommentSettings({ ...s, rules: s.rules.map((r) => ({ words: r.words, reply: r.reply, private: r.private ?? "" })) }));
    setErrors(!r.ok && r.fieldErrors ? r.fieldErrors : {});
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Status */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="type-h3 text-ink">Facebook Page</h2>
              {connected ? <Badge tone="success">Connected</Badge> : status.page.status === "requested" ? <Badge tone="warning">Waiting for Retexia</Badge> : <Badge tone="neutral">Not connected</Badge>}
              {on ? <Badge tone="brand">Answering comments</Badge> : null}
            </div>
            <p className="type-small text-ink-muted">
              {status.page.id ? `${status.page.name ?? "Page"} · ID ${status.page.id}` : "Uses the Page from Autopublish → Accounts."}
              {on ? ` · last check ${ago(status.last_checked_at)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {on ? (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => go(() => checkNow())}>
                <RefreshCw aria-hidden size={14} strokeWidth={1.75} /> Check now
              </Button>
            ) : null}
            <div className="rounded-full border border-line bg-surface-raised px-4 py-2">
              <Switch checked={on} disabled={pending || (!connected && !on)} label={on ? "Auto comment is on" : "Auto comment is off"} onCheckedChange={(v) => go(() => setAutoComment(v))} />
            </div>
          </div>
        </div>
        {!connected ? (
          <Alert tone="info" title="Connect your Facebook Page first" action={<Button size="sm" href="/autopublish/accounts">Open Accounts</Button>}>
            Auto comment uses the Page you share with Retexia in Autopublish → Accounts. It starts once Retexia confirms it.
          </Alert>
        ) : null}
        {on && status.problem ? <Alert tone="warning" title="Facebook needs attention">{status.problem}</Alert> : null}
        {on && !status.problem ? <p className="type-small text-ink-muted">Only comments written after you switched it on ({ago(status.started_at)}) are answered. Checks run every minute.</p> : null}
      </Card>

      {/* Last 24 hours */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Replied" value={stats.replied} hint="last 24 hours" icon={<MessageCircleReply aria-hidden size={18} strokeWidth={1.5} />} />
        <StatCard label="Private messages" value={stats.private} hint="last 24 hours" icon={<MessageSquareText aria-hidden size={18} strokeWidth={1.5} />} />
        <StatCard label="Hidden" value={stats.hidden} hint="last 24 hours" icon={<EyeOff aria-hidden size={18} strokeWidth={1.5} />} />
        <StatCard label="First comments" value={stats.first} hint="last 24 hours" icon={<Pin aria-hidden size={18} strokeWidth={1.5} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Settings */}
        <div className="flex flex-col gap-6">
          <Section
            title="Replies under comments"
            description="The first rule whose words are in the comment answers it. Otherwise one of your replies, a different one each time. {name} becomes the commenter's first name."
            aside={<Switch checked={s.reply_on} onCheckedChange={(v) => set("reply_on", v)} label="Reply" />}
          >
            <div className="flex flex-col gap-3">
              {s.rules.map((r, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-md border border-line bg-surface-sunk p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="type-label text-ink">Rule {i + 1}</p>
                    <Button size="sm" variant="ghost" onClick={() => {
                        set("rules", s.rules.filter((_, j) => j !== i));
                        setRaw((x) => x.filter((_, j) => j !== i));
                      }} aria-label={`Remove rule ${i + 1}`}>
                      <Trash2 aria-hidden size={14} strokeWidth={1.75} />
                    </Button>
                  </div>
                  <Field label="When the comment has any of these words" optionalLabel="" hint="Separate with commas. Sinhala, Singlish and English all work.">
                    <Input
                      value={raw[i] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRaw((x) => x.map((w, j) => (j === i ? v : w)));
                        setRule(i, { words: toWords(v).slice(0, LIMITS.words) });
                      }}
                    />
                  </Field>
                  <Field label="Reply under the comment" optionalLabel="">
                    <Textarea rows={2} maxLength={LIMITS.text} value={r.reply} onChange={(e) => setRule(i, { reply: e.target.value })} />
                  </Field>
                  <Field label="Private message for this rule" hint="Empty = the general private message below.">
                    <Textarea rows={2} maxLength={LIMITS.text} value={r.private ?? ""} onChange={(e) => setRule(i, { private: e.target.value })} />
                  </Field>
                </div>
              ))}
              {s.rules.length < LIMITS.rules ? (
                <Button size="sm" variant="secondary" className="self-start" onClick={() => {
                    set("rules", [...s.rules, { words: [], reply: "", private: "" }]);
                    setRaw((x) => [...x, ""]);
                  }}>
                  <Plus aria-hidden size={14} strokeWidth={1.75} /> Add a rule
                </Button>
              ) : null}
            </div>
            <Field label="Default replies" optionalLabel="" hint="One per line, up to 5. Used when no rule matches." error={errors.replies}>
              <Textarea rows={3} value={s.replies.join("\n")} onChange={(e) => set("replies", e.target.value.split("\n").slice(0, LIMITS.replies))} />
            </Field>
          </Section>

          <Section
            title="Private message"
            description="Facebook lets a Page send one private message (Messenger) to each commenter, within 7 days. Hidden comments get it too, so a customer who left their number still hears from you."
            aside={<Switch checked={s.private_on} onCheckedChange={(v) => set("private_on", v)} label="Send" />}
          >
            <Field label="Message" optionalLabel="" error={errors.private_text}>
              <Textarea rows={3} maxLength={LIMITS.text} value={s.private_text} onChange={(e) => set("private_text", e.target.value)} />
            </Field>
          </Section>

          <Section
            title="First comment"
            description="The Page's own comment on every new ad or post, right after it goes live (for example how to order). Only ads and posts made after you switch Auto comment on."
            aside={<Switch checked={s.first_on} onCheckedChange={(v) => set("first_on", v)} label="Post" />}
          >
            <Field label="Comment" optionalLabel="" error={errors.first_text}>
              <Textarea rows={2} maxLength={LIMITS.text} value={s.first_text} onChange={(e) => set("first_text", e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-6">
              <Switch checked={s.first_on_ads} onCheckedChange={(v) => set("first_on_ads", v)} label="On ads" />
              <Switch checked={s.first_on_posts} onCheckedChange={(v) => set("first_on_posts", v)} label="On Page posts" />
            </div>
            {errors.first_on_ads ? <p className="type-small text-danger">{errors.first_on_ads}</p> : null}
          </Section>

          <Section
            title="Hide comments"
            description="Hidden comments stay visible to the person who wrote them and their friends, so nobody notices. Phone numbers are hidden to protect your customers and to stop competitors."
            aside={<Switch checked={s.hide_on} onCheckedChange={(v) => set("hide_on", v)} label="Hide" />}
          >
            <div className="flex flex-wrap gap-6">
              <Switch checked={s.hide_phones} onCheckedChange={(v) => set("hide_phones", v)} label="Phone numbers" />
              <Switch checked={s.hide_links} onCheckedChange={(v) => set("hide_links", v)} label="Links" />
            </div>
            <Field label="Words to hide" hint="Separate with commas, e.g. scam, boru, fake, බොරු.">
              <Input
                value={hideRaw}
                onChange={(e) => {
                  setHideRaw(e.target.value);
                  set("hide_words", toWords(e.target.value).slice(0, LIMITS.hideWords));
                }}
              />
            </Field>
          </Section>

          <div className="flex justify-end">
            <Button disabled={pending} onClick={save}>Save settings</Button>
          </div>
        </div>

        {/* Try + activity */}
        <div className="flex flex-col gap-6">
          <Section title="Try a comment" description="See what Auto comment does with a comment, using the settings on this page (saved or not). Nothing is sent.">
            <Field label="Comment" optionalLabel="">
              <Textarea rows={2} value={tryText} onChange={(e) => setTryText(e.target.value)} />
            </Field>
            <Field label="Commenter's name">
              <Input value={tryName} onChange={(e) => setTryName(e.target.value)} />
            </Field>
            <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunk p-3">
              {trial.hide ? (
                <p className="flex items-center gap-2 type-small text-warning"><EyeOff aria-hidden size={14} strokeWidth={1.75} /> Hidden ({trial.hide})</p>
              ) : null}
              {trial.reply ? (
                <div className="flex flex-col gap-1">
                  <p className="type-caption text-ink-muted">Reply under the comment{trial.rule && trial.rule !== "default" ? ` · rule: ${trial.rule}` : ""}</p>
                  <p className="type-body text-ink">{trial.reply}</p>
                </div>
              ) : null}
              {trial.private ? (
                <div className="flex flex-col gap-1">
                  <p className="type-caption text-ink-muted">Private message</p>
                  <p className="type-body text-ink">{trial.private}</p>
                </div>
              ) : null}
              {!trial.hide && !trial.reply && !trial.private ? <p className="type-small text-ink-muted">Nothing: replies and private messages are off.</p> : null}
            </div>
          </Section>

          <Section title="What it did" description="The newest first.">
            {log.length ? (
              <ul className="flex flex-col gap-3">
                {log.map((l) => (
                  <li key={l.id} className="flex flex-col gap-1.5 border-b border-line pb-3 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral">{l.post_kind === "ad" ? "Ad" : "Post"}</Badge>
                      {l.kind === "first_comment" ? <Badge tone={l.status === "done" ? "brand" : "danger"}>First comment</Badge> : null}
                      {l.done.includes("replied") ? <Badge tone="success">Replied</Badge> : null}
                      {l.done.includes("private") ? <Badge tone="success">Messaged</Badge> : null}
                      {l.done.includes("hidden") ? <Badge tone="warning">Hidden</Badge> : null}
                      {l.status === "failed" && l.kind === "comment" ? <Badge tone="danger">Failed</Badge> : null}
                      <span className="type-small text-ink-muted">{ago(l.created_at)}</span>
                    </div>
                    {l.kind === "comment" ? (
                      <p className="type-small text-ink">
                        <span className="text-ink-muted">{l.author ? `${l.author.split(/\s+/)[0]}: ` : ""}</span>
                        {l.message || <em className="text-ink-muted">(a sticker or photo)</em>}
                      </p>
                    ) : null}
                    {l.reply && l.done.some((d) => d === "replied" || d === "first_comment") ? <p className="type-small text-ink-muted">↳ {l.reply}</p> : null}
                    {l.error ? <p className="type-small text-danger">{l.error}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-small text-ink-muted">Nothing yet. Switch Auto comment on, then comment on one of your ads to see it work.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
