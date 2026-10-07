"use client";

import { Button, CheckboxGroup, Field, Input, Select } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createBusiness } from "@/app/post/actions";
import { CATEGORIES, COUNTRIES, LANGUAGES } from "@/lib/post/options";

export function WelcomeForm() {
  const router = useRouter();
  const [v, setV] = useState({ name: "", category: "", country: "LK", timezone: "Asia/Colombo", languages: ["en"] as string[] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await createBusiness({ ...v, languages: v.languages as ("en" | "si" | "ta")[] });
        setBusy(false);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          return toast.error(r.message);
        }
        router.push("/brand?welcome=1");
        router.refresh();
      }}
    >
      <Field label="Business name" error={errors.name} required>
        <Input autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="What kind of business?" hint="Some types (health, alcohol, finance) always need your approval before posting." optionalLabel="Optional">
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
