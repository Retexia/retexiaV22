"use client";

import { Button, Card, Field, Input, Select } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { startLingoSetup } from "@/app/lingo/whatsapp-actions";
import type { Lang } from "@/lib/lingo/db.types";
import { LANGS } from "@/lib/lingo/labels";

/** Step 1 of self-setup: name the bot; the next page links the phone. */
export function LingoSetupForm({ initial }: { initial: { business_name: string; owner_phone: string } }) {
  const router = useRouter();
  const [v, setV] = useState({ ...initial, default_language: "singlish" as Lang });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await startLingoSetup(v);
          setBusy(false);
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            return toast.error(r.message);
          }
          toast.success(r.message ?? "Done");
          router.push("/connect?welcome=1");
          router.refresh();
        }}
      >
        <div>
          <h1 className="type-h2 text-ink">Set up your Lingo</h1>
          <p className="mt-1 type-body text-ink-muted">Two minutes: tell us your business name, then link your WhatsApp by scanning a code.</p>
        </div>
        <Field label="Business name" hint="Lingo uses it when it talks to customers." error={errors.business_name} required>
          <Input value={v.business_name} onChange={(e) => setV({ ...v, business_name: e.target.value })} />
        </Field>
        <Field label="Your phone for new-order alerts" hint="With country code, e.g. 94771234567. Can be the same number." error={errors.owner_phone} optionalLabel="Optional">
          <Input inputMode="tel" value={v.owner_phone} onChange={(e) => setV({ ...v, owner_phone: e.target.value })} />
        </Field>
        <Field label="Lingo replies in" hint="Customers can ask to switch language.">
          <Select value={v.default_language} onChange={(e) => setV({ ...v, default_language: (e.target.value || "singlish") as Lang })} options={LANGS} />
        </Field>
        <Button type="submit" size="lg" loading={busy}>
          Continue
        </Button>
      </form>
    </Card>
  );
}
