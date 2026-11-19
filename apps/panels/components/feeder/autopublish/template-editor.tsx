"use client";

import { Alert, Badge, Button, Card, Checkbox, Field, Input, RadioCards, Select, Switch, Textarea } from "@retexia/ui";
import { Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveTemplate, searchInterests } from "@/app/feeder/(app)/autopublish/actions";
import {
  applyPreset,
  checkTemplate,
  COUNTRIES,
  CTAS,
  defaultAudience,
  LIMITS,
  OBJECTIVES,
  PRESETS,
  sampleSummaries,
  type Audience,
  type Objective,
  type Platform,
  type TemplateData,
} from "@/lib/feeder/autopublish/plan";

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));
const txt = (n: number | null | undefined) => (n == null ? "" : String(n));

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-h2 text-ink">{title}</h2>
        {hint ? <p className="type-small text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </Card>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={`type-small ${value.length > max ? "text-danger" : "text-ink-muted"}`}>{value.length} / {max}</span>;
}

/** Interests: search Meta's real interests and pick (never made-up IDs). */
function Interests({ value, onChange }: { value: Audience["interests"]; onChange: (v: Audience["interests"]) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; size: number | null; path: string }[]>([]);
  const [busy, setBusy] = useState(false);
  async function search() {
    if (q.trim().length < 2) return;
    setBusy(true);
    const r = await searchInterests({ q });
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    setFound(r.data ?? []);
    if (!r.data?.length) toast.message("No Meta interest with that name. Try another word.");
  }
  return (
    <div className="flex flex-col gap-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((i) => (
            <li key={i.id} className="flex items-center gap-1 rounded-full border border-line bg-surface-sunk py-0.5 pl-3 pr-1 type-small text-ink">
              {i.name}
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== i.id))} className="rounded-full p-0.5 text-ink-muted hover:text-ink focus-visible:focus-ring">
                <X aria-hidden size={12} strokeWidth={2} />
                <span className="sr-only">Remove {i.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="e.g. home decor, diabetes awareness, beauty"
          aria-label="Search Meta interests"
          className="min-w-0 flex-1"
        />
        <Button variant="secondary" onClick={search} loading={busy} disabled={q.trim().length < 2}>
          <Search aria-hidden size={14} strokeWidth={1.75} /> Find
        </Button>
      </div>
      {found.length ? (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-line">
          {found.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={value.some((x) => x.id === f.id) || value.length >= 25}
                onClick={() => onChange([...value, { id: f.id, name: f.name }])}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-sunk disabled:opacity-50 focus-visible:focus-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate type-body text-ink">{f.name}</span>
                  {f.path ? <span className="block truncate type-small text-ink-muted">{f.path}</span> : null}
                </span>
                {f.size ? <span className="shrink-0 type-small text-ink-muted">{f.size >= 1e6 ? `${(f.size / 1e6).toFixed(1)}M` : `${Math.round(f.size / 1e3)}K`} people</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AudienceEditor({ a, i, onChange, onRemove, errors, meta }: { a: Audience; i: number; onChange: (a: Audience) => void; onRemove?: () => void; errors: Record<string, string>; meta: boolean }) {
  const up = (p: Partial<Audience>) => onChange({ ...a, ...p });
  const f = `audiences.${i}`;
  return (
    <div className="flex flex-col gap-4 rounded-md border border-line p-4">
      <div className="flex items-start gap-3">
        <Field label="Audience name" className="flex-1" error={errors[`${f}.name`]} required>
          <Input value={a.name} maxLength={60} onChange={(e) => up({ name: e.target.value })} />
        </Field>
        {onRemove ? (
          <Button variant="ghost" size="sm" onClick={onRemove} className="mt-7">
            <Trash2 aria-hidden size={14} strokeWidth={1.75} /> Remove
          </Button>
        ) : null}
      </div>
      <Field label="Who sees it" labelAs="legend" required>
        <RadioCards
          name={`mode-${i}`}
          columns={2}
          value={a.mode}
          onChange={(m) => up(m === "ai" ? { mode: "ai", age_min: Math.min(25, a.age_min), age_max: 65 } : { mode: "manual" })}
          options={[
            { value: "ai", label: "AI audience (recommended)", description: "Meta Advantage+ audience / TikTok broad targeting: the platform finds the buyers. Country and minimum age are strict; the rest are hints." },
            { value: "manual", label: "Exact audience", description: "Only the ages, gender and interests you set. Use it when you must reach only a certain group." },
          ]}
        />
      </Field>
      <Field label="Countries" error={errors[`${f}.countries`]} required>
        <div className="flex flex-wrap gap-2">
          {COUNTRIES.map((c) => (
            <label key={c.value} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 type-small ${a.countries.includes(c.value) ? "border-brand bg-brand-soft text-ink" : "border-line text-ink-muted"}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={a.countries.includes(c.value)}
                onChange={(e) => up({ countries: e.target.checked ? [...a.countries, c.value] : a.countries.filter((x) => x !== c.value) })}
              />
              {c.label}
            </label>
          ))}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Youngest age" hint={a.mode === "ai" && meta ? "18–25 in AI mode" : undefined} error={errors[`${f}.age_min`]} required>
          <Input inputMode="numeric" value={a.age_min} onChange={(e) => up({ age_min: Number(e.target.value.replace(/\D/g, "")) || 18 })} />
        </Field>
        {a.mode === "manual" ? (
          <Field label="Oldest age" error={errors[`${f}.age_max`]} required>
            <Input inputMode="numeric" value={a.age_max} onChange={(e) => up({ age_max: Number(e.target.value.replace(/\D/g, "")) || 65 })} />
          </Field>
        ) : (
          <Field label="Ages you prefer" hint="A hint, e.g. 30–50" error={errors[`${f}.suggest_age`]}>
            <div className="flex items-center gap-2">
              <Input inputMode="numeric" aria-label="From age" value={a.suggest_age?.[0] ?? ""} onChange={(e) => up({ suggest_age: e.target.value ? [Number(e.target.value.replace(/\D/g, "")), a.suggest_age?.[1] ?? 65] : null })} />
              <span className="text-ink-muted">–</span>
              <Input inputMode="numeric" aria-label="To age" value={a.suggest_age?.[1] ?? ""} onChange={(e) => up({ suggest_age: e.target.value ? [a.suggest_age?.[0] ?? 18, Number(e.target.value.replace(/\D/g, ""))] : null })} />
            </div>
          </Field>
        )}
        <Field label="Gender" hint={a.mode === "ai" ? "A hint in AI mode" : undefined}>
          <Select
            value={a.genders}
            onChange={(e) => up({ genders: e.target.value as Audience["genders"] })}
            options={[
              { value: "all", label: "Everyone" },
              { value: "female", label: "Women" },
              { value: "male", label: "Men" },
            ]}
          />
        </Field>
      </div>
      {meta ? (
        <Field label="Interests (Meta)" hint={a.mode === "ai" ? "Hints for the AI audience" : "Only people with these interests"}>
          <Interests value={a.interests} onChange={(interests) => up({ interests })} />
        </Field>
      ) : null}
    </div>
  );
}

/** Autopublish template: what a launch makes (layout, budget, audiences, ad text, form), checked as you type. */
export function TemplateEditor({ id, initial, currency }: { id: string | null; initial: TemplateData; currency: string }) {
  const router = useRouter();
  const [t, setT] = useState<TemplateData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const up = (p: Partial<TemplateData>) => setT((x) => ({ ...x, ...p }));
  const s = t.structure;
  const setBudget = (p: Partial<TemplateData["structure"]["budget"]>) => up({ structure: { ...s, budget: { ...s.budget, ...p } } });
  const hasMeta = t.platforms.includes("meta");
  const hasTikTok = t.platforms.includes("tiktok");

  const samples = useMemo(() => sampleSummaries(t, currency), [t, currency]);
  // The template's own checks plus what the layout can't make (budget minimums, limits), as the server checks on save.
  const check = useMemo(() => {
    const c = checkTemplate(t);
    for (const e of samples.flatMap((x) => x.errors)) if (!/creative/.test(e.field) && !c.errors.some((x) => x.message === e.message)) c.errors.push(e);
    return c;
  }, [t, samples]);
  const fieldErr = (k: string) => errors[k] ?? check.errors.find((e) => e.field === k)?.message;

  function togglePlatform(p: Platform, on: boolean) {
    const platforms = on ? [...new Set([...t.platforms, p])] : t.platforms.filter((x) => x !== p);
    up({ platforms: platforms.length ? platforms : t.platforms });
  }

  async function save() {
    setBusy(true);
    setErrors({});
    const r = await saveTemplate({ id, data: t });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    toast.success(r.message ?? "Saved");
    router.push("/autopublish/templates");
    router.refresh();
  }

  const preset = PRESETS.find((p) => p.key === s.preset);
  const needsExisting = s.campaign.mode === "existing" || s.adsets.mode === "existing";
  const fixedAdset = s.budget.level === "adset" && s.budget.adset_split === "fixed";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <Section title="Basics">
          <Field label="Template name" error={fieldErr("name")} required>
            <Input value={t.name} maxLength={80} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Daily product ads" />
          </Field>
          <Field label="Where" labelAs="legend" error={fieldErr("platforms")} required>
            <div className="flex flex-wrap gap-4">
              <Checkbox label="Facebook & Instagram" checked={hasMeta} onChange={(e) => togglePlatform("meta", e.target.checked)} />
              <Checkbox label="TikTok (videos only)" checked={hasTikTok} onChange={(e) => togglePlatform("tiktok", e.target.checked)} />
            </div>
          </Field>
          <Field label="What you want" labelAs="legend" error={fieldErr("objective")} required>
            <RadioCards
              name="objective"
              columns={2}
              value={t.objective}
              onChange={(o) => up({ objective: o as Objective, copy: { ...t.copy, cta: CTAS[o as Objective][0]!.value } })}
              options={OBJECTIVES.map((o) => ({ value: o.value, label: o.label, description: `${o.description}${o.tiktok ? "" : " Meta only."}` }))}
            />
          </Field>
        </Section>

        <Section title="Layout" hint="How the campaign, ad sets and ads are arranged. You can change the numbers below.">
          <div className="grid gap-3 sm:grid-cols-2">
            {PRESETS.map((p) => {
              const on = s.preset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => up({ structure: applyPreset(s, p.key) })}
                  aria-pressed={on}
                  className={`flex flex-col gap-1.5 rounded-md border p-4 text-left transition-hover focus-visible:focus-ring ${on ? "border-brand bg-brand-soft" : "border-line bg-surface-raised hover:border-line-strong"}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="type-body font-medium text-ink">{p.label}</span>
                    {p.recommended ? (
                      <Badge tone="success">
                        <Sparkles aria-hidden size={11} strokeWidth={1.75} className="mr-1 inline" />
                        Recommended
                      </Badge>
                    ) : null}
                  </span>
                  <span className="type-code text-ink-muted">campaign · ad set · ads = {p.shape}</span>
                  <span className="type-small text-ink-muted">{p.description}</span>
                </button>
              );
            })}
          </div>
          {needsExisting ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {t.platforms.map((p) => {
                const k = s.adsets.mode === "existing" ? "adsets" : "campaign";
                const field = `structure.${k}.existing_id.${p}`;
                return (
                  <Field key={p} label={`${p === "meta" ? "Meta" : "TikTok"} ${k === "adsets" ? (p === "meta" ? "ad set" : "ad group") : "campaign"} ID`} hint="Copy it from Ads Manager" error={fieldErr(field)} required>
                    <Input
                      inputMode="numeric"
                      value={s[k].existing_id[p] ?? ""}
                      onChange={(e) => up({ structure: { ...s, [k]: { ...s[k], existing_id: { ...s[k].existing_id, [p]: e.target.value.replace(/\D/g, "") || null } } } })}
                    />
                  </Field>
                );
              })}
            </div>
          ) : null}
          {preset?.key === "evergreen" ? (
            <p className="type-small text-ink-muted">Each product gets one long-running campaign per platform. Proven ad sets are never touched; every launch adds a new ad set with the new creatives.</p>
          ) : null}
        </Section>

        <Section title="Budget" hint={`In your ad account's currency (${currency}).`}>
          {s.campaign.mode === "existing" && s.budget.level === "campaign" ? (
            <p className="type-body text-ink-muted">New ad sets use the existing campaign&apos;s own budget. If that campaign uses ad set budgets instead, choose &quot;Each ad set&quot; below.</p>
          ) : null}
          {s.adsets.mode === "existing" ? (
            <p className="type-body text-ink-muted">New ads go into the existing ad set and use its budget.</p>
          ) : (
            <>
              <Field label="Who holds the budget" labelAs="legend">
                <RadioCards
                  name="budget-level"
                  columns={2}
                  value={s.budget.level}
                  onChange={(level) => setBudget({ level: level as "campaign" | "adset" })}
                  options={[
                    { value: "campaign", label: "The campaign", description: "The platform moves money to the ad sets doing best (Advantage campaign budget / TikTok CBO)." },
                    { value: "adset", label: "Each ad set", description: "Fixed money per ad set: fair tests between creatives or audiences." },
                  ]}
                />
              </Field>
              {s.budget.level === "adset" ? (
                <Field label="Ad set budgets" labelAs="legend">
                  <RadioCards
                    name="adset-split"
                    columns={2}
                    compact
                    value={s.budget.adset_split}
                    onChange={(v) => setBudget({ adset_split: v as "fixed" | "divide" })}
                    options={[
                      { value: "fixed", label: "The same amount for each ad set" },
                      { value: "divide", label: "One amount shared equally" },
                    ]}
                  />
                </Field>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Type">
                  <Select
                    value={s.budget.type}
                    onChange={(e) => setBudget({ type: e.target.value as "daily" | "lifetime" })}
                    options={[
                      { value: "daily", label: "Per day" },
                      { value: "lifetime", label: "For the whole run" },
                    ]}
                  />
                </Field>
                {fixedAdset ? (
                  <Field label={`Each ad set (${currency})`} error={fieldErr("structure.budget.adset_amount")} required>
                    <Input inputMode="decimal" value={txt(s.budget.adset_amount)} onChange={(e) => setBudget({ adset_amount: num(e.target.value) })} />
                  </Field>
                ) : s.campaign.mode !== "existing" || s.budget.level === "adset" ? (
                  <Field label={s.budget.level === "adset" ? `Shared (${currency})` : `Each campaign (${currency})`} error={fieldErr("structure.budget.amount")} required>
                    <Input inputMode="decimal" value={txt(s.budget.amount)} onChange={(e) => setBudget({ amount: num(e.target.value) })} />
                  </Field>
                ) : null}
                <Field label="Raise at launch up to" hint="% over this budget">
                  <Input inputMode="numeric" value={s.budget.boost_pct_max} onChange={(e) => setBudget({ boost_pct_max: Math.min(500, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
                </Field>
              </div>
              {hasTikTok ? (
                <Field label={`TikTok's own budget (${currency})`} hint="TikTok's minimum is higher (about USD 50 a day per campaign, USD 20 per ad group). Empty = the same as above." error={fieldErr("tiktok_budget")}>
                  <Input
                    inputMode="decimal"
                    value={txt(fixedAdset ? s.tiktok_budget.adset_amount : s.tiktok_budget.amount)}
                    onChange={(e) => up({ structure: { ...s, tiktok_budget: fixedAdset ? { ...s.tiktok_budget, adset_amount: num(e.target.value) } : { ...s.tiktok_budget, amount: num(e.target.value) } } })}
                  />
                </Field>
              ) : null}
            </>
          )}
          <Field label={`Target cost per result (${currency})`} hint="Optional. Used to warn when a budget is too thin to learn (about 50 results a week).">
            <Input inputMode="decimal" value={txt(t.target_cost_per_result)} onChange={(e) => up({ target_cost_per_result: num(e.target.value) })} />
          </Field>
        </Section>

        <Section title="Audiences" hint="One is enough. Add more for the “per audience” layouts.">
          {t.audiences.map((a, i) => (
            <AudienceEditor
              key={i}
              a={a}
              i={i}
              meta={hasMeta}
              errors={Object.fromEntries(check.errors.map((e) => [e.field, e.message]))}
              onChange={(n) => up({ audiences: t.audiences.map((x, j) => (j === i ? n : x)) })}
              onRemove={t.audiences.length > 1 ? () => up({ audiences: t.audiences.filter((_, j) => j !== i) }) : undefined}
            />
          ))}
          {t.audiences.length < 5 ? (
            <div>
              <Button variant="secondary" size="sm" onClick={() => up({ audiences: [...t.audiences, { ...defaultAudience(), name: `Audience ${t.audiences.length + 1}` }] })}>
                <Plus aria-hidden size={14} strokeWidth={1.75} /> Add audience
              </Button>
            </div>
          ) : null}
        </Section>

        <Section title="Ad text" hint="{product} becomes the product name and {price} its selling price.">
          <Field label="Main text" error={fieldErr("copy.primary_text")} required>
            <Textarea rows={4} value={t.copy.primary_text} onChange={(e) => up({ copy: { ...t.copy, primary_text: e.target.value } })} />
            <Counter value={t.copy.primary_text} max={LIMITS.primary_text} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Headline" error={fieldErr("copy.headline")}>
              <Input value={t.copy.headline} maxLength={LIMITS.headline} onChange={(e) => up({ copy: { ...t.copy, headline: e.target.value } })} />
            </Field>
            <Field label="Description" error={fieldErr("copy.description")}>
              <Input value={t.copy.description} maxLength={LIMITS.description} onChange={(e) => up({ copy: { ...t.copy, description: e.target.value } })} />
            </Field>
          </div>
          {t.objective !== "messages" ? (
            <Field label="Button" error={fieldErr("copy.cta")} required>
              <Select value={t.copy.cta} onChange={(e) => up({ copy: { ...t.copy, cta: e.target.value } })} options={CTAS[t.objective]} />
            </Field>
          ) : null}
          {hasTikTok ? (
            <Field label="TikTok text" hint="Up to 100 characters. Empty = the main text, when it's short enough." error={fieldErr("copy.tiktok_text")}>
              <Input value={t.copy.tiktok_text} maxLength={LIMITS.tiktok_text} onChange={(e) => up({ copy: { ...t.copy, tiktok_text: e.target.value } })} />
            </Field>
          ) : null}
        </Section>

        <Section title={t.objective === "leads" ? "Lead form" : t.objective === "messages" ? "Messages" : "Website"}>
          {t.objective === "leads" ? (
            <>
              <Field label="Which Instant Form" labelAs="legend">
                <RadioCards
                  name="form-mode"
                  columns={2}
                  value={t.destination.lead_form.mode}
                  onChange={(m) => up({ destination: { ...t.destination, lead_form: { ...t.destination.lead_form, mode: m as "product" | "pick" } } })}
                  options={[
                    { value: "product", label: "Named after the product (recommended)", description: "Uses the form called exactly like the product's form name on your Page, or Retexia makes it. Bulk create then matches every lead." },
                    { value: "pick", label: "Pick a form at launch", description: "Choose one of your Page's forms each time; its name is added to the product's form names." },
                  ]}
                />
              </Field>
              {t.destination.lead_form.mode === "product" ? (
                <div className="flex flex-col gap-3">
                  <p className="type-small text-ink-muted">When Retexia makes the form it asks for: full name, phone, address{t.destination.lead_form.city ? ", city" : ""}{t.destination.lead_form.quantity ? " and quantity" : ""}.</p>
                  <div className="flex flex-wrap gap-4">
                    <Checkbox label="Ask for the city" checked={t.destination.lead_form.city} onChange={(e) => up({ destination: { ...t.destination, lead_form: { ...t.destination.lead_form, city: e.target.checked } } })} />
                    <Checkbox label="Ask how many (1–5)" checked={t.destination.lead_form.quantity} onChange={(e) => up({ destination: { ...t.destination, lead_form: { ...t.destination.lead_form, quantity: e.target.checked } } })} />
                  </div>
                  <Field label="Intro on the form" hint="Optional, e.g. “Cash on delivery. We'll call you to confirm.”">
                    <Input value={t.destination.lead_form.intro} maxLength={300} onChange={(e) => up({ destination: { ...t.destination, lead_form: { ...t.destination.lead_form, intro: e.target.value } } })} />
                  </Field>
                </div>
              ) : null}
              {hasTikTok ? <p className="type-small text-ink-muted">TikTok: Retexia uses your TikTok Instant Form with the product&apos;s form name, or the one you pick at launch.</p> : null}
            </>
          ) : t.objective === "messages" ? (
            <Field label="Messages go to" labelAs="legend">
              <RadioCards
                name="app"
                columns={2}
                compact
                value={t.destination.message_app}
                onChange={(m) => up({ destination: { ...t.destination, message_app: m as "whatsapp" | "messenger" } })}
                options={[
                  { value: "whatsapp", label: "WhatsApp (the number linked to your Page)" },
                  { value: "messenger", label: "Messenger" },
                ]}
              />
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Website link" error={fieldErr("destination.url")} required>
                <Input type="url" value={t.destination.url} onChange={(e) => up({ destination: { ...t.destination, url: e.target.value } })} placeholder="https://…" />
              </Field>
              {t.objective === "sales" ? (
                <Field label="Pixel event">
                  <Select
                    value={t.destination.pixel_event}
                    onChange={(e) => up({ destination: { ...t.destination, pixel_event: e.target.value as TemplateData["destination"]["pixel_event"] } })}
                    options={[
                      { value: "PURCHASE", label: "Purchase" },
                      { value: "INITIATED_CHECKOUT", label: "Checkout started" },
                      { value: "ADD_TO_CART", label: "Add to cart" },
                      { value: "LEAD", label: "Lead" },
                      { value: "COMPLETE_REGISTRATION", label: "Registration" },
                    ]}
                  />
                </Field>
              ) : null}
            </div>
          )}
        </Section>

        <Section title="When and how">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Start">
              <Select
                value={t.schedule.start}
                onChange={(e) => up({ schedule: { ...t.schedule, start: e.target.value as TemplateData["schedule"]["start"], hours: e.target.value === "in_hours" ? (t.schedule.hours ?? 2) : null } })}
                options={[
                  { value: "immediate", label: "As soon as it's approved" },
                  { value: "next_day", label: "Next day at midnight" },
                  { value: "in_hours", label: "In a few hours" },
                ]}
              />
            </Field>
            {t.schedule.start === "in_hours" ? (
              <Field label="Hours from launch" error={fieldErr("schedule.hours")}>
                <Input inputMode="numeric" value={txt(t.schedule.hours)} onChange={(e) => up({ schedule: { ...t.schedule, hours: num(e.target.value) } })} />
              </Field>
            ) : null}
            <Field label="Run for (days)" hint="Empty = keep running" error={fieldErr("schedule.duration_days")}>
              <Input inputMode="numeric" value={txt(t.schedule.duration_days)} onChange={(e) => up({ schedule: { ...t.schedule, duration_days: num(e.target.value) } })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="After it's built">
              <Select
                value={t.launch_as}
                onChange={(e) => up({ launch_as: e.target.value as "active" | "paused" })}
                options={[
                  { value: "active", label: "Switch on (send to review)" },
                  { value: "paused", label: "Leave paused; I'll switch it on" },
                ]}
              />
            </Field>
            <Field label="Approval">
              <Select
                value={t.require_approval == null ? "" : t.require_approval ? "yes" : "no"}
                onChange={(e) => up({ require_approval: e.target.value === "" ? null : e.target.value === "yes" })}
                placeholder="As set in Accounts"
                options={[
                  { value: "yes", label: "Always ask for approval" },
                  { value: "no", label: "Never ask" },
                ]}
              />
            </Field>
          </div>
          {hasTikTok ? (
            <Switch checked={t.image_on_tiktok === "skip_tiktok"} onCheckedChange={(c) => up({ image_on_tiktok: c ? "skip_tiktok" : "reject" })} label="Images go to Meta only" description="TikTok ads here are videos. Off = a launch with an image is refused." />
          ) : null}
          <Field label="At launch, people may change" labelAs="legend">
            <div className="flex flex-wrap gap-4">
              {(["budget", "start", "copy"] as const).map((k) => (
                <Checkbox
                  key={k}
                  label={k === "budget" ? "The budget" : k === "start" ? "The start" : "The ad text"}
                  checked={t.overridable.includes(k)}
                  onChange={(e) => up({ overridable: e.target.checked ? [...t.overridable, k] : t.overridable.filter((x) => x !== k) })}
                />
              ))}
            </div>
          </Field>
        </Section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="flex flex-col gap-3">
          <h2 className="type-h3 text-ink">What it makes</h2>
          <ul className="flex flex-col gap-3">
            {samples.map((x) => (
              <li key={x.creatives} className="flex flex-col gap-0.5">
                <span className="type-label text-ink">
                  With {x.creatives} creative{x.creatives === 1 ? "" : "s"}
                </span>
                <span className={`type-small ${x.errors.length ? "text-danger" : "text-ink-muted"}`}>{x.errors.length ? x.errors[0]!.message : x.summary}</span>
              </li>
            ))}
          </ul>
        </Card>
        {check.errors.length ? (
          <Alert tone="danger" title="To fix before saving">
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {check.errors.slice(0, 6).map((e) => (
                <li key={e.field + e.message}>{e.message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {check.warnings.length ? (
          <Alert tone="warning" title="Good to know">
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {check.warnings.slice(0, 6).map((e) => (
                <li key={e.field + e.message}>{e.message}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <Button onClick={save} loading={busy} disabled={busy || check.errors.length > 0} fullWidth>
          Save template
        </Button>
      </aside>
    </div>
  );
}
