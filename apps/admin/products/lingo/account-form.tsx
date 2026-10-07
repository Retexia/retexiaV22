"use client";

import { Button, Field, Input, Select } from "@retexia/ui";
import { useState } from "react";
import { toast } from "sonner";
import { createLingoAccount } from "./actions";

export const LANGS = [
  { value: "singlish", label: "Singlish" },
  { value: "si", label: "Sinhala" },
  { value: "en", label: "English" },
  { value: "ta", label: "Tamil" },
];
type Lang = "singlish" | "si" | "en" | "ta";

/** New bot account: the business's WhatsApp number on Evolution API. */
export function NewLingoAccountForm({
  orderId,
  ownerId,
  defaults,
  onDone,
  onCancel,
}: {
  orderId?: string;
  ownerId?: string | null;
  defaults?: { business_name?: string; owner_phone?: string };
  onDone: (id: number) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    business_name: defaults?.business_name ?? "",
    evolution_instance: "",
    evolution_base_url: "",
    evolution_apikey: "",
    owner_phone: defaults?.owner_phone ?? "",
    default_language: "singlish" as Lang,
  });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await createLingoAccount({ orderId, ownerId, ...form });
        setBusy(false);
        if (r.ok && r.data) {
          toast.success(r.message ?? "Created");
          onDone(r.data);
        } else toast.error(r.message ?? "Could not create it");
      }}
    >
      <Field label="Business name" optionalLabel="">
        <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required />
      </Field>
      <Field label="Owner's WhatsApp (alerts)" hint="With country code, e.g. 94771234567">
        <Input value={form.owner_phone} inputMode="numeric" onChange={(e) => setForm({ ...form, owner_phone: e.target.value })} />
      </Field>
      <Field label="Evolution instance name" optionalLabel="">
        <Input value={form.evolution_instance} onChange={(e) => setForm({ ...form, evolution_instance: e.target.value })} required />
      </Field>
      <Field label="Evolution API address" optionalLabel="">
        <Input type="url" placeholder="https://evo.example.com" value={form.evolution_base_url} onChange={(e) => setForm({ ...form, evolution_base_url: e.target.value })} required />
      </Field>
      <Field label="Instance API key" hint="Stored for the bot only; never shown again." optionalLabel="">
        <Input type="password" autoComplete="off" value={form.evolution_apikey} onChange={(e) => setForm({ ...form, evolution_apikey: e.target.value })} required />
      </Field>
      <Field label="Bot language" optionalLabel="">
        <Select value={form.default_language} onChange={(e) => setForm({ ...form, default_language: e.target.value as Lang })} options={LANGS} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>
          Create bot account
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
