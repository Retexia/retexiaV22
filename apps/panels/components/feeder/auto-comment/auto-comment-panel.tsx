"use client";

import { Alert, Badge, Button, Card, Field, Input, Switch, Textarea } from "@retexia/ui";
import { StatCard } from "@retexia/ui/admin";
import { EyeOff, MessageCircleReply, MessageSquareText, Pin, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { checkNow, saveCommentSettings, setAutoComment, tryComment, type TryResult } from "@/app/feeder/(app)/auto-comment/actions";
import type { CommentStatus, LogItem } from "@/lib/feeder/auto-comment/data";
import { LIMITS, type CommentSettings, type Rule } from "@/lib/feeder/auto-comment/rules";

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
  const [tryPost, setTryPost] = useState("");
  const [trial, setTrial] = useState<TryResult | null>(null);
  const [trying, startTry] = useTransition();
  const set = <K extends keyof CommentSettings>(k: K, v: CommentSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const setRule = (i: number, r: Partial<Rule>) => set("rules", s.rules.map((x, j) => (j === i ? { ...x, ...r } : x)));
  // What the customer typed in the word fields (commas and spaces kept while typing).
  const [raw, setRaw] = useState(() => s.rules.map((r) => r.words.join(", ")));
  const runTry = () =>
    startTry(async () => {
      const r = await tryComment({ text: tryText, name: tryName, post: tryPost, settings: s });
      if (r.ok && r.data) setTrial(r.data);
      else if (!r.ok) toast.error(r.message);
    });
  const connected = status.connected;
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
              <h2 className="type-h3 text-ink">{status.pages.length > 1 ? "Facebook Pages" : "Facebook Page"}</h2>
              {connected ? <Badge tone="success">Connected</Badge> : status.via === "partner" && status.partnerStatus === "requested" ? <Badge tone="warning">Waiting for Retexia</Badge> : <Badge tone="neutral">Not connected</Badge>}
              {on ? <Badge tone="brand">Answering comments</Badge> : null}
            </div>
            <p className="type-small text-ink-muted">
              {status.pages.length ? status.pages.map((p) => p.name ?? `Page ${p.id}`).join(" · ") : "Choose up to 2 Pages in Connections."}
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
          <Alert tone="info" title="Connect your Facebook Pages first" action={<Button size="sm" href="/connections#facebook">Open Connections</Button>}>
            Connect your Meta Business portfolio in Connections and tick up to 2 Pages for Auto comment. A token with only Page permissions is enough.
          </Alert>
        ) : null}
        {on && status.problem ? <Alert tone="warning" title="Needs attention">{status.problem}</Alert> : null}
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
            title="AI"
            description="The AI reads every comment with your products (My products) and your business details, then hides what you describe below, writes the reply and the private message. Write in your own words, in English, Sinhala or Singlish."
            aside={<Switch checked={s.ai_on} onCheckedChange={(v) => set("ai_on", v)} label="Use AI" />}
          >
            <Field label="What to hide" optionalLabel="" hint="Which comments should disappear. Real questions and complaints are answered, not hidden." error={errors.hide_rules}>
              <Textarea rows={6} maxLength={LIMITS.instructions} value={s.hide_rules} disabled={!s.ai_on} onChange={(e) => set("hide_rules", e.target.value)} />
            </Field>
            <Field label="How to reply" optionalLabel="" hint="Tone, what to say in public and what in the private message." error={errors.reply_style}>
              <Textarea rows={5} maxLength={LIMITS.instructions} value={s.reply_style} disabled={!s.ai_on} onChange={(e) => set("reply_style", e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-6">
              <Switch checked={s.reply_on} onCheckedChange={(v) => set("reply_on", v)} label="Reply under comments" />
              <Switch checked={s.private_on} onCheckedChange={(v) => set("private_on", v)} label="Send a private message" />
              <Switch checked={s.hide_on} onCheckedChange={(v) => set("hide_on", v)} label="Hide comments" />
            </div>
          </Section>

          <Section
            title="Backup replies"
            description="Used when the AI is off or can't answer. The first rule whose words are in the comment answers it; otherwise one of your default replies. {name} becomes the commenter's first name."
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
            title="Backup private message"
            description="Facebook lets a Page send one private message (Messenger) to each commenter, within 7 days. The AI writes its own with your product's details; this one is used when it can't."
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
            title="Always hide"
            description="Hidden straight away, with or without AI. Hidden comments stay visible to the person who wrote them and their friends, so nobody notices. The customer still gets the private message."
          >
            <div className="flex flex-wrap gap-6">
              <Switch checked={s.hide_phones} disabled={!s.hide_on} onCheckedChange={(v) => set("hide_phones", v)} label="Phone numbers" />
              <Switch checked={s.hide_links} disabled={!s.hide_on} onCheckedChange={(v) => set("hide_links", v)} label="Links" />
            </div>
          </Section>

          <div className="flex justify-end">
            <Button disabled={pending} onClick={save}>Save settings</Button>
          </div>
        </div>

        {/* Try + activity */}
        <div className="flex flex-col gap-6">
          <Section title="Try a comment" description="See what Auto comment does with a comment, using the settings on this page (saved or not). Nothing is sent to Facebook.">
            <Field label="Comment" optionalLabel="">
              <Textarea rows={2} value={tryText} onChange={(e) => setTryText(e.target.value)} maxLength={800} />
            </Field>
            <Field label="Commenter's name">
              <Input value={tryName} onChange={(e) => setTryName(e.target.value)} maxLength={60} />
            </Field>
            <Field label="The ad's text" hint="Helps the AI know which product it's about.">
              <Textarea rows={2} value={tryPost} onChange={(e) => setTryPost(e.target.value)} maxLength={600} />
            </Field>
            <Button size="sm" variant="secondary" className="self-start" disabled={trying || !tryText.trim()} onClick={runTry}>
              <Sparkles aria-hidden size={14} strokeWidth={1.75} /> {trying ? "Thinking…" : "Try it"}
            </Button>
            {trial ? (
              <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunk p-3">
                <div className="flex flex-wrap gap-1.5">{trial.ai ? <Badge tone="brand">AI</Badge> : <Badge tone="neutral">Backup reply</Badge>}</div>
                {trial.aiNote ? <p className="type-small text-ink-muted">{trial.aiNote}</p> : null}
                {trial.hide ? (
                  <p className="flex items-center gap-2 type-small text-warning"><EyeOff aria-hidden size={14} strokeWidth={1.75} /> Hidden ({trial.hide})</p>
                ) : null}
                {trial.reply ? (
                  <div className="flex flex-col gap-1">
                    <p className="type-caption text-ink-muted">Reply under the comment{trial.rule && !["default", "AI"].includes(trial.rule) ? ` · rule: ${trial.rule}` : ""}</p>
                    <p className="type-body text-ink">{trial.reply}</p>
                  </div>
                ) : null}
                {trial.private ? (
                  <div className="flex flex-col gap-1">
                    <p className="type-caption text-ink-muted">Private message</p>
                    <p className="type-body whitespace-pre-wrap text-ink">{trial.private}</p>
                  </div>
                ) : null}
                {!trial.hide && !trial.reply && !trial.private ? <p className="type-small text-ink-muted">Nothing: this comment needs no answer, or replies and private messages are off.</p> : null}
              </div>
            ) : null}
          </Section>

          <Section title="What it did" description="The newest first.">
            {log.length ? (
              <ul className="flex flex-col gap-3">
                {log.map((l) => (
                  <li key={l.id} className="flex flex-col gap-1.5 border-b border-line pb-3 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral">{l.post_kind === "ad" ? "Ad" : "Post"}</Badge>
                      {l.ai ? <Badge tone="brand">AI</Badge> : null}
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
