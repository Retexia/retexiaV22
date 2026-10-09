"use client";

import { Alert, Button, Card, CheckboxGroup, Field, Input, RadioCards, Select, Switch } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveSettings, updateBasics } from "@/app/post/actions";
import { savePlaylistSettings } from "@/app/post/playlist-actions";
import { CAPTION_LANGUAGES, DESIGN_LANGUAGES } from "@/lib/post/languages";
import { defaultTimes } from "@/lib/post/plans";
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

export function SettingsForm({
  basics: initialBasics,
  settings: initial,
  sensitive,
  limits,
}: {
  basics: Basics;
  settings: Settings;
  sensitive: boolean;
  limits: { label: string; postsPerDay: number; storiesPerDay: number };
}) {
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
      <PlaylistSection settings={initial} sensitive={sensitive} limits={limits} />

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
              whatsapp: { enabled: s.whatsapp.enabled, number: s.whatsapp.number || null, types: s.whatsapp.types as ("morning" | "evening" | "alerts")[], quiet_hours: s.whatsapp.quiet_hours },
            });
            setBusy(null);
            finish(r);
          }}
        >
          Save messages
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

/** The daily playlist: how many posts and stories, their times, the languages, publishing. */
function PlaylistSection({ settings, sensitive, limits }: { settings: Settings; sensitive: boolean; limits: { label: string; postsPerDay: number; storiesPerDay: number } }) {
  const router = useRouter();
  const [v, setV] = useState({
    posts: settings.playlist.posts,
    stories: settings.playlist.stories,
    post_times: settings.playlist.post_times,
    story_times: settings.playlist.story_times,
    caption_language: settings.caption_language as string,
    design_language: settings.design_language as string,
    auto_publish: settings.auto_publish && !sensitive,
    paused: settings.paused,
  });
  const [busy, setBusy] = useState(false);
  const resize = (times: string[], n: number, story: boolean) => {
    const d = defaultTimes(n, story);
    return Array.from({ length: n }, (_, i) => times[i] ?? d[i]!);
  };
  const count = (n: number) => Array.from({ length: n + 1 }, (_, i) => ({ value: String(i), label: String(i) }));

  return (
    <Section
      title="Daily playlist"
      description={`At 6 AM every day, tomorrow's playlist is written with these numbers. Everything is designed overnight and ready by 6 AM. The ${limits.label} plan allows up to ${limits.postsPerDay} posts and ${limits.storiesPerDay} stories a day.`}
    >
      <Switch checked={v.paused} onCheckedChange={(paused) => setV({ ...v, paused })} label="Pause all publishing" description="Holiday, closed for a few days? Nothing is published or planned until you turn this off." />
      <Switch
        checked={v.auto_publish}
        disabled={sensitive}
        onCheckedChange={(auto_publish) => setV({ ...v, auto_publish })}
        label="Publish automatically"
        description={sensitive ? "Your business type always needs your approval before posting." : v.auto_publish ? "Items go out at their time unless you change or delete them." : "Manual approval: each item waits for you. Not approved by its time = skipped."}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Field label="Posts a day">
            <Select value={String(v.posts)} onChange={(e) => { const n = Number(e.target.value); setV({ ...v, posts: n, post_times: resize(v.post_times, n, false) }); }} options={count(limits.postsPerDay)} />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {v.post_times.map((t, i) => (
              <Field key={i} label={`Post ${i + 1}`}>
                <Input type="time" value={t} onChange={(e) => setV({ ...v, post_times: v.post_times.map((x, j) => (j === i ? e.target.value : x)) })} />
              </Field>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Stories a day">
            <Select value={String(v.stories)} onChange={(e) => { const n = Number(e.target.value); setV({ ...v, stories: n, story_times: resize(v.story_times, n, true) }); }} options={count(limits.storiesPerDay)} />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {v.story_times.map((t, i) => (
              <Field key={i} label={`Story ${i + 1}`}>
                <Input type="time" value={t} onChange={(e) => setV({ ...v, story_times: v.story_times.map((x, j) => (j === i ? e.target.value : x)) })} />
              </Field>
            ))}
          </div>
        </div>
      </div>
      <Field label="Captions in" labelAs="legend" hint="Each item can use another language too: change it on the item.">
        <RadioCards name="caption-language" value={v.caption_language} onChange={(caption_language) => setV({ ...v, caption_language })} columns={3} compact options={CAPTION_LANGUAGES.map((l) => ({ value: l.value, label: l.label, description: l.description }))} />
      </Field>
      <Field label="Text on the pictures in" labelAs="legend" hint="Sinhala and Tamil letters are drawn by the AI: check each design, and press Redo if a word looks wrong.">
        <RadioCards name="design-language" value={v.design_language} onChange={(design_language) => setV({ ...v, design_language })} columns={3} compact options={DESIGN_LANGUAGES.map((l) => ({ value: l.value, label: l.label, description: l.description }))} />
      </Field>
      <Button
        className="self-start"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await savePlaylistSettings(v);
          setBusy(false);
          toast[r.ok ? "success" : "error"](r.message ?? "");
          if (r.ok) router.refresh();
        }}
      >
        Save playlist
      </Button>
    </Section>
  );
}
