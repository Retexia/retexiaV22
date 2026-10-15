"use client";

import { Button, CheckboxGroup, Field, Input, Select } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createBusiness } from "@/app/post/actions";
import { CATEGORIES, COUNTRIES, LANGUAGES } from "@/lib/post/options";

type Initial = { name: string; category: string; languages: string[] };

/**
 * First visit: the business details from the order form, confirmed with one
 * click ("Change details" opens the form). Next: connect Facebook & Instagram.
 */
export function WelcomeForm({ initial }: { initial: Initial | null }) {
  const router = useRouter();
  const [v, setV] = useState({ name: initial?.name ?? "", category: initial?.category ?? "", country: "LK", timezone: "Asia/Colombo", languages: initial?.languages ?? ["en"] });
  const [editing, setEditing] = useState(!initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const languageNames = v.languages.map((l) => LANGUAGES.find((x) => x.value === l)?.label ?? l).join(", ");

  async function submit() {
    setBusy(true);
    const r = await createBusiness({ ...v, languages: v.languages as ("en" | "si" | "ta")[] });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setEditing(true);
      return toast.error(r.message);
    }
    router.push("/start");
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-4">
        <dl className="grid gap-3 rounded-lg border border-line bg-surface-sunk p-4 sm:grid-cols-2">
          <div>
            <dt className="type-small text-ink-muted">Business</dt>
            <dd className="type-label text-ink">{v.name}</dd>
          </div>
          <div>
            <dt className="type-small text-ink-muted">Type</dt>
            <dd className="type-label text-ink">{v.category || "Not set"}</dd>
          </div>
          <div>
            <dt className="type-small text-ink-muted">Posts in</dt>
            <dd className="type-label text-ink">{languageNames}</dd>
          </div>
          <div>
            <dt className="type-small text-ink-muted">Time zone</dt>
            <dd className="type-label text-ink">Sri Lanka</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" loading={busy} onClick={submit}>
            Looks right, continue
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setEditing(true)}>
            Change details
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Business name" error={errors.name} required>
        <Input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="What kind of business?" optionalLabel="Optional">
        <Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} options={CATEGORIES} placeholder="Choose one" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country">
          <Select value={v.country} onChange={(e) => setV({ ...v, country: e.target.value || "LK" })} options={COUNTRIES} />
        </Field>
        <Field label="Time zone" error={errors.timezone}>
          <Input value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} />
        </Field>
      </div>
      <Field label="Post in" labelAs="legend" error={errors.languages}>
        <CheckboxGroup name="languages" options={LANGUAGES} value={v.languages} onChange={(languages) => setV({ ...v, languages })} columns={2} />
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        Continue
      </Button>
    </form>
  );
}
