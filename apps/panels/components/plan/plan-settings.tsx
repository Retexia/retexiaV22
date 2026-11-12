"use client";

import { Button, Card, Field, Input, RadioCards, Select, Switch } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { savePlanSettings, sendTestWhatsApp } from "@/app/plan/actions";
import type { PlanSettings } from "@/lib/plan/session";

const ZONES = ["Asia/Colombo", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "UTC"];

export function PlanSettingsForm({ settings, workerReady }: { settings: PlanSettings; workerReady: boolean }) {
  const router = useRouter();
  const [v, setV] = useState({ ...settings, whatsapp: settings.whatsapp ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  async function save() {
    setBusy(true);
    const r = await savePlanSettings(v);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    setErrors({});
    toast.success(r.message ?? "Saved");
    router.refresh();
  }

  return (
    <div className="flex max-w-content flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-h3 text-ink">Morning WhatsApp</h2>
          <p className="type-body text-ink-muted">Every morning: your tasks for the day, your streak and how your goals are going, written by the Retexia coach.</p>
        </div>
        <Switch checked={v.morning_on} onCheckedChange={(morning_on) => setV({ ...v, morning_on })} label="Send me a morning message" />
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="WhatsApp number" hint="With the country code, e.g. +94771234567" error={errors.whatsapp}>
            <Input inputMode="tel" value={v.whatsapp} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} />
          </Field>
          <Field label="At" error={errors.morning_time}>
            <Input type="time" value={v.morning_time} onChange={(e) => setV({ ...v, morning_time: e.target.value })} />
          </Field>
        </div>
        {workerReady ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            loading={testing}
            disabled={!settings.whatsapp}
            onClick={async () => {
              setTesting(true);
              const r = await sendTestWhatsApp();
              setTesting(false);
              toast[r.ok ? "success" : "error"](r.message ?? "");
            }}
          >
            Send a test message
          </Button>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-h3 text-ink">Weekly email</h2>
          <p className="type-body text-ink-muted">Sunday evening: what you did this week, your streak, which goals are on track and which need a push.</p>
        </div>
        <Switch checked={v.weekly_on} onCheckedChange={(weekly_on) => setV({ ...v, weekly_on })} label="Email me my week" />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="type-h3 text-ink">Coach and time</h2>
        <Field label="The coach writes in" labelAs="legend">
          <RadioCards
            name="coach_language"
            columns={2}
            compact
            value={v.coach_language}
            onChange={(coach_language) => setV({ ...v, coach_language: coach_language as PlanSettings["coach_language"] })}
            options={[
              { value: "en", label: "English" },
              { value: "si", label: "සිංහල (Sinhala)" },
              { value: "singlish", label: "Singlish" },
              { value: "ta", label: "தமிழ் (Tamil)" },
            ]}
          />
        </Field>
        <Field label="Time zone" hint="Your days, streaks and reminders follow it." className="max-w-xs">
          <Select value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} options={[...new Set([v.timezone, ...ZONES])].map((z) => ({ value: z, label: z.replace("_", " ") }))} />
        </Field>
      </Card>

      <Button className="self-start" loading={busy} onClick={save}>
        Save
      </Button>
    </div>
  );
}
