"use client";

import { Badge, Button, Card, Checkbox, Field, Input, Select, Switch, Textarea } from "@retexia/ui";
import { useState } from "react";
import { deleteRule, resetFixedText, saveFixedText, saveRule, toggleGlobalRule } from "@/app/feeder/(app)/lingo/actions";
import { chars, LIMIT, PLACEHOLDERS, type FixedKind } from "@/lib/feeder/lingo/labels";
import { useAction, WaBubble } from "./common";

const SAMPLE: Record<string, string> = {
  "{business}": "Amaya Shop", "{name}": "Saman", "{product}": "Ayora Gastric Care", "{price}": "1,340", "{delivery_fee}": "450", "{total}": "1,790",
  "{qty}": "1", "{address}": "No 12, Temple Rd, Kandy", "{contact}": "0771234567", "{missing}": "ලිපිනය", "{shop_phone}": "0771234567",
  "{shop_address}": "Kandy", "{delivery_days}": "3",
};
const sample = (s: string, vals: Record<string, string>) => s.replace(/\{\w+\}/g, (m) => vals[m] ?? m);

/** One fixed text: Sinhala + English, with WhatsApp's limit and a live preview. */
export function TextEditor({ k, label, kind, hint, defaults, own, shop }: { k: string; label: string; kind: FixedKind; hint?: string; defaults: { si: string; en: string }; own?: { si: string; en: string }; shop: Record<string, string> }) {
  const [si, setSi] = useState(own?.si ?? "");
  const [en, setEn] = useState(own?.en ?? "");
  const [lang, setLang] = useState<"si" | "en">("si");
  const { pending, go } = useAction();
  const limit = LIMIT[kind];
  const shown = (lang === "si" ? si || defaults.si : en || defaults.en || si || defaults.si);
  const vals = { ...SAMPLE, ...shop };
  const over = chars(si) > limit || chars(en) > limit;
  const button = kind === "button" || kind === "list_button";
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-label text-ink">{label} {own ? <Badge tone="brand">Your text</Badge> : null}</h3>
        <div className="flex gap-1" role="group" aria-label="Preview language">
          {(["si", "en"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`rounded-full px-2.5 py-0.5 type-small focus-visible:focus-ring ${lang === l ? "bg-brand-soft text-brand" : "text-ink-muted hover:text-ink"}`}>
              {l === "si" ? "සිංහල" : "English"}
            </button>
          ))}
        </div>
      </div>
      {hint ? <p className="type-small text-ink-muted">{hint}</p> : null}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col gap-3">
          <Field label="Sinhala (and Singlish customers)" hint={`${chars(si || defaults.si)}/${limit.toLocaleString("en-US")}`}>
            {button ? <Input value={si} placeholder={defaults.si} onChange={(e) => setSi(e.target.value)} /> : <Textarea rows={3} value={si} placeholder={defaults.si} onChange={(e) => setSi(e.target.value)} />}
          </Field>
          <Field label="English" hint={`${chars(en || defaults.en)}/${limit.toLocaleString("en-US")}`}>
            {button ? <Input value={en} placeholder={defaults.en} onChange={(e) => setEn(e.target.value)} /> : <Textarea rows={3} value={en} placeholder={defaults.en} onChange={(e) => setEn(e.target.value)} />}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || over || (!si && !en)} onClick={() => go(() => saveFixedText({ key: k, si, en }))}>Save</Button>
            {own ? <Button size="sm" variant="ghost" disabled={pending} onClick={async () => { const r = await go(() => resetFixedText(k)); if (r.ok) { setSi(""); setEn(""); } }}>Use Retexia&apos;s text</Button> : null}
            {over ? <span className="type-small text-danger">Too long for WhatsApp ({limit} max).</span> : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunk p-3">
          {button ? <WaBubble text="…" buttons={[sample(shown, vals).slice(0, 20)]} /> : shown ? <WaBubble text={sample(shown, vals)} /> : <p className="type-small text-ink-muted">Empty: Lingo says it will check and hands the chat to you.</p>}
        </div>
      </div>
    </Card>
  );
}

export function Placeholders() {
  return <p className="type-small text-ink-muted">Placeholders filled in by Lingo: {PLACEHOLDERS.join(" ")}</p>;
}

type Rule = { id: number; lingo_user_id: number | null; pattern: string; stage_in: string[]; k: string; t: string | null; hits: number; note: string | null };
const KINDS = [
  { value: "chat", label: "Greeting / thanks" }, { value: "question", label: "A question (pick the topic)" }, { value: "confirm", label: "Yes, confirm the order" },
  { value: "cancel", label: "Cancel" }, { value: "details", label: "A phone number" }, { value: "human", label: "Wants a person" }, { value: "complaint", label: "Complaint" }, { value: "change", label: "Change the order" },
];
const TOPICS = [{ value: "price", label: "Price" }, { value: "delivery", label: "Delivery" }, { value: "payment", label: "Payment" }, { value: "stock", label: "Stock" }, { value: "contact", label: "Contact" }, { value: "shop", label: "Shop details" }];
const STAGES = [{ v: "new", l: "New" }, { v: "browsing", l: "Asking" }, { v: "collecting", l: "Giving details" }, { v: "confirming", l: "Confirming" }, { v: "ordered", l: "Ordered" }, { v: "cancelled", l: "Cancelled" }];

export function RulesEditor({ rules, disabled }: { rules: Rule[]; disabled: number[] }) {
  const { pending, go } = useAction();
  const [v, setV] = useState({ pattern: "", k: "question", t: "price", stage_in: [] as string[], note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const off = new Set(disabled);
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <h3 className="type-h3 text-ink">Quick rules</h3>
        <p className="type-small text-ink-muted">Messages that match a rule exactly (the whole message, punctuation and emojis ignored) are answered with no AI at all. Rules are JavaScript patterns, not case sensitive.</p>
        <ul className="flex flex-col">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="type-label text-ink">{r.note || KINDS.find((x) => x.value === r.k)?.label} {r.lingo_user_id ? <Badge tone="brand">Yours</Badge> : null}</p>
                <p className="truncate font-mono type-small text-ink-muted" title={r.pattern}>{r.pattern}</p>
                <p className="type-small text-ink-muted">{r.stage_in.length ? `Only when: ${r.stage_in.map((s) => STAGES.find((x) => x.v === s)?.l ?? s).join(", ")} · ` : ""}{r.hits} hit{r.hits === 1 ? "" : "s"}</p>
              </div>
              {r.lingo_user_id ? (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => go(() => deleteRule(r.id))}>Delete</Button>
              ) : (
                <Switch checked={!off.has(r.id)} disabled={pending} label={off.has(r.id) ? "Off" : "On"} onCheckedChange={(on) => go(() => toggleGlobalRule({ id: r.id, off: !on }))} />
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col gap-3">
        <h3 className="type-h3 text-ink">Add a rule</h3>
        <Field label="Pattern" hint="e.g. ^(cod|cash on delivery( thiyenawada)?)$" error={errors.pattern}>
          <Input value={v.pattern} onChange={(e) => setV({ ...v, pattern: e.target.value })} className="font-mono" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="It means"><Select value={v.k} onChange={(e) => setV({ ...v, k: e.target.value })} options={KINDS} /></Field>
          {v.k === "question" ? <Field label="Topic" error={errors.t}><Select value={v.t} onChange={(e) => setV({ ...v, t: e.target.value })} options={TOPICS} /></Field> : null}
        </div>
        <Field label="Only at these steps" hint="None ticked = always." labelAs="legend">
          <div className="flex flex-wrap gap-3">
            {STAGES.map((s) => (
              <label key={s.v} className="flex items-center gap-2 type-small text-ink">
                <Checkbox checked={v.stage_in.includes(s.v)} onChange={(e) => setV({ ...v, stage_in: e.target.checked ? [...v.stage_in, s.v] : v.stage_in.filter((x) => x !== s.v) })} />
                {s.l}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Name (for you)"><Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={120} /></Field>
        <Button
          className="self-start"
          disabled={pending || !v.pattern.trim()}
          onClick={async () => {
            const r = await go(() => saveRule({ pattern: v.pattern, k: v.k as "chat", t: (v.k === "question" ? v.t : "") as "", stage_in: v.stage_in as "new"[], note: v.note }));
            setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
            if (r.ok) setV({ pattern: "", k: "question", t: "price", stage_in: [], note: "" });
          }}
        >
          Add rule
        </Button>
      </Card>
    </div>
  );
}
