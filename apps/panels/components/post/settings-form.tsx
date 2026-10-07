"use client";

import { Alert, Button, Card, CheckboxGroup, Field, Input, Select, Switch } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveSettings, updateBasics } from "@/app/post/actions";
import { CATEGORIES, COUNTRIES, LANGUAGES } from "@/lib/post/options";
import type { Settings } from "@/lib/post/post-db.types";

type Basics = { name: string; category: string; country: string; timezone: string; languages: string[] };

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-h2 text-ink">{title}</h2>
        {description ? <p className="type-small text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </Card>
  );
}

export function SettingsForm({ basics: initialBasics, settings: initial, sensitive, weekPlanAllowed }: { basics: Basics; settings: Settings; sensitive: boolean; weekPlanAllowed: boolean }) {
  const router = useRouter();
  const [b, setB] = useState(initialBasics);
  const [s, setS] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const finish = (r: { ok: boolean; message?: string; fieldErrors?: Record<string, string> }) => {
    setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
    toast[r.ok ? "success" : "error"](r.message ?? "");
    if (r.ok) router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="Posting" description="Each day has three post times (plus stories). Posts can be changed until 15 minutes before their time.">
        <Switch
          checked={s.paused}
          onCheckedChange={(paused) => setS({ ...s, paused })}
          label="Pause all publishing"
          description="Holiday, closed for a few days? Nothing is published until you turn this off."
        />
        <Switch
          checked={s.auto_publish && !sensitive}
          disabled={sensitive}
          onCheckedChange={(auto_publish) => setS({ ...s, auto_publish })}
          label="Publish automatically"
          description={
            sensitive
              ? "Your business type always needs your approval before posting."
              : s.auto_publish
                ? "Posts go out at their time unless you change or stop them."
                : "Manual approval: each post waits for you. Not approved by its time = skipped."
          }
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {s.slots.map((t, i) => (
            <Field key={i} label={`Post ${i + 1}`} error={i === 0 ? errors.slots : undefined}>
              <Input type="time" value={t} onChange={(e) => setS({ ...s, slots: s.slots.map((x, j) => (j === i ? e.target.value : x)) })} />
            </Field>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Photo posts a day" error={errors.content_mix}>
            <Select
              value={String(s.content_mix.photo)}
              onChange={(e) => {
                const photo = Number(e.target.value);
                setS({ ...s, content_mix: { photo, reel: 3 - photo } });
              }}
              options={["0", "1", "2", "3"].map((v) => ({ value: v, label: v }))}
            />
          </Field>
          <Field label="Reels a day" hint="The rest of the 3 posts.">
            <Input value={String(s.content_mix.reel)} disabled />
          </Field>
          <Field label="Stories a day">
            <Select value={String(s.stories_per_day)} onChange={(e) => setS({ ...s, stories_per_day: Number(e.target.value) })} options={["0", "1", "2", "3"].map((v) => ({ value: v, label: v }))} />
          </Field>
        </div>
        {weekPlanAllowed ? null : <p className="type-small text-ink-muted">The week plan is not part of your plan; offers still work.</p>}
      </Section>

      <Section title="WhatsApp messages" description="One short message in the morning (today's posts, with an approve link), one in the evening (what went out), and alerts when something needs you.">
        <Switch checked={s.whatsapp.enabled} onCheckedChange={(enabled) => setS({ ...s, whatsapp: { ...s.whatsapp, enabled } })} label="Send me WhatsApp messages" description="Reply STOP at any time to turn them off." />
        {s.whatsapp.enabled ? (
          <>
            <Field label="WhatsApp number" hint="International format, e.g. +94771234567" error={errors["whatsapp.number"]} required>
              <Input value={s.whatsapp.number ?? ""} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, number: e.target.value } })} />
            </Field>
            <Field label="Send" labelAs="legend">
              <CheckboxGroup
                name="wa-types"
                value={s.whatsapp.types}
                onChange={(types) => setS({ ...s, whatsapp: { ...s.whatsapp, types } })}
                columns={2}
                options={[
                  { value: "morning", label: "Morning: today's posts" },
                  { value: "evening", label: "Evening: what was published" },
                  { value: "alerts", label: "Alerts: failures and things that need me" },
                ]}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quiet from">
                <Input type="time" value={s.whatsapp.quiet_hours[0]} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, quiet_hours: [e.target.value, s.whatsapp.quiet_hours[1]] } })} />
              </Field>
              <Field label="Until">
                <Input type="time" value={s.whatsapp.quiet_hours[1]} onChange={(e) => setS({ ...s, whatsapp: { ...s.whatsapp, quiet_hours: [s.whatsapp.quiet_hours[0], e.target.value] } })} />
              </Field>
            </div>
          </>
        ) : null}
      </Section>

      <div className="flex justify-end">
        <Button
          loading={busy === "settings"}
          onClick={async () => {
            setBusy("settings");
            const r = await saveSettings({
              auto_publish: s.auto_publish && !sensitive,
              week_plan_enabled: s.week_plan_enabled,
              slots: [s.slots[0]!, s.slots[1]!, s.slots[2]!],
              content_mix: s.content_mix,
              stories_per_day: s.stories_per_day,
              paused: s.paused,
              whatsapp: { enabled: s.whatsapp.enabled, number: s.whatsapp.number || null, types: s.whatsapp.types as ("morning" | "evening" | "alerts")[], quiet_hours: s.whatsapp.quiet_hours },
            });
            setBusy(null);
            finish(r);
          }}
        >
          Save schedule and messages
        </Button>
      </div>

      <Section title="Business details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" error={errors.name} required>
            <Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
          </Field>
          <Field label="Type of business" optionalLabel="Optional">
            <Select value={b.category} onChange={(e) => setB({ ...b, category: e.target.value })} options={CATEGORIES} placeholder="Choose one" />
          </Field>
          <Field label="Country">
            <Select value={b.country} onChange={(e) => setB({ ...b, country: e.target.value || "LK" })} options={COUNTRIES} />
          </Field>
          <Field label="Time zone" hint="Post times are in this time zone." error={errors.timezone}>
            <Input value={b.timezone} onChange={(e) => setB({ ...b, timezone: e.target.value })} />
          </Field>
          <Field label="Post in" labelAs="legend" error={errors.languages} className="sm:col-span-2">
            <CheckboxGroup name="languages" options={LANGUAGES} value={b.languages} onChange={(languages) => setB({ ...b, languages })} columns={2} />
          </Field>
        </div>
        {b.category !== initialBasics.category && ["Health and wellness", "Supplements", "Alcohol", "Finance and insurance"].includes(b.category) ? (
          <Alert tone="info">This type of business always needs your approval before posting.</Alert>
        ) : null}
        <Button
          className="self-start"
          variant="secondary"
          loading={busy === "basics"}
          onClick={async () => {
            setBusy("basics");
            const r = await updateBasics({ ...b, languages: b.languages as ("en" | "si" | "ta")[] });
            setBusy(null);
            finish(r);
          }}
        >
          Save business details
        </Button>
      </Section>
    </div>
  );
}
