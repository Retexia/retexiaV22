"use client";

import { Button, Card, Field, Input, Select, Switch, Textarea } from "@retexia/ui";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveGeneralSettings } from "@/app/(panel)/settings/actions";
import { MediaInput } from "@/components/website/media-picker";
import { SaveBar } from "./save-bar";

export type GeneralSettings = {
  site_name: string;
  tagline: string;
  contact_email: string;
  contact_phone: string;
  whatsapp_number: string;
  whatsapp_default_message: string;
  address: string;
  business_hours: string;
  logo_url: string;
  logo_dark_url: string;
  favicon_url: string;
  og_image_url: string;
  seo_title_template: string;
  seo_default_title: string;
  seo_default_description: string;
  footer_text: string;
  copyright_text: string;
  social_links: { label: string; url: string }[];
  announcement_enabled: boolean;
  announcement_text: string;
  announcement_href: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  default_theme: "light" | "dark" | "system";
  currency_code: string;
  currency_locale: string;
  auth_google_enabled: boolean;
  auth_magic_link_enabled: boolean;
};

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

export function GeneralForm({ initial }: { initial: GeneralSettings }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof GeneralSettings>(k: K, val: GeneralSettings[K]) => setV((x) => ({ ...x, [k]: val }));
  const input = (k: keyof GeneralSettings, label: string, opts: { hint?: string; required?: boolean; placeholder?: string; type?: string; wide?: boolean } = {}) => (
    <Field label={label} hint={opts.hint} error={errors[k]} required={opts.required} optionalLabel={opts.required ? undefined : "Optional"} className={opts.wide ? "sm:col-span-2" : undefined}>
      <Input type={opts.type} value={String(v[k] ?? "")} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  );
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  const save = async () => {
    setBusy(true);
    const changed = Object.fromEntries(Object.entries(v).filter(([k, val]) => JSON.stringify(val) !== JSON.stringify(initial[k as keyof GeneralSettings])));
    const r = await saveGeneralSettings(changed);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.message);
    }
    setErrors({});
    toast.success(r.message ?? "Saved");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="Business">
        <div className="grid gap-4 sm:grid-cols-2">
          {input("site_name", "Site name", { required: true })}
          {input("tagline", "Tagline")}
          {input("contact_email", "Contact email", { type: "email" })}
          {input("contact_phone", "Phone")}
          {input("whatsapp_number", "WhatsApp number", { hint: "With country code, digits only: 94770000000" })}
          {input("whatsapp_default_message", "WhatsApp first message", { hint: "Pre-filled when someone taps the WhatsApp button." })}
          <Field label="Address" optionalLabel="Optional">
            <Textarea rows={2} value={v.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          {input("business_hours", "Opening hours", { placeholder: "Mon–Fri, 9:00–18:00" })}
        </div>
      </Section>

      <Section title="Logos and images" description="Leave empty to use the built-in Retexia logo.">
        <div className="grid gap-4">
          <Field label="Logo (light mode)" optionalLabel="Optional">
            <MediaInput value={v.logo_url} onChange={(x) => set("logo_url", x)} />
          </Field>
          <Field label="Logo (dark mode)" optionalLabel="Optional">
            <MediaInput value={v.logo_dark_url} onChange={(x) => set("logo_dark_url", x)} />
          </Field>
          <Field label="Favicon" optionalLabel="Optional">
            <MediaInput value={v.favicon_url} onChange={(x) => set("favicon_url", x)} />
          </Field>
          <Field label="Default share image" hint="1200 × 630." optionalLabel="Optional">
            <MediaInput value={v.og_image_url} onChange={(x) => set("og_image_url", x)} />
          </Field>
        </div>
      </Section>

      <Section title="Search engines">
        <div className="grid gap-4 sm:grid-cols-2">
          {input("seo_title_template", "Title pattern", { hint: "%s becomes the page title.", required: true })}
          {input("seo_default_title", "Home page title")}
          <Field label="Default description" hint={`${v.seo_default_description.length}/160`} optionalLabel="Optional" className="sm:col-span-2">
            <Textarea rows={2} value={v.seo_default_description} onChange={(e) => set("seo_default_description", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Footer and social links">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Footer text" optionalLabel="Optional">
            <Textarea rows={2} value={v.footer_text} onChange={(e) => set("footer_text", e.target.value)} />
          </Field>
          {input("copyright_text", "Copyright line", { placeholder: "© Retexia" })}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 type-label text-ink">Social links</legend>
          {v.social_links.map((s, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label="Network" value={s.label} placeholder="Facebook" onChange={(e) => set("social_links", v.social_links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="max-w-48" />
              <Input aria-label="Link" value={s.url} placeholder="https://facebook.com/…" onChange={(e) => set("social_links", v.social_links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <Button variant="ghost" size="sm" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => set("social_links", v.social_links.filter((_, j) => j !== i))}>
                <span className="sr-only">Remove</span>
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="self-start" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => set("social_links", [...v.social_links, { label: "", url: "" }])}>
            Add link
          </Button>
        </fieldset>
      </Section>

      <Section title="Announcement bar" description="A thin bar above the header on every page.">
        <Switch checked={v.announcement_enabled} onCheckedChange={(x) => set("announcement_enabled", x)} label="Show the announcement" />
        <div className="grid gap-4 sm:grid-cols-2">
          {input("announcement_text", "Text")}
          {input("announcement_href", "Link", { placeholder: "/lingo" })}
        </div>
      </Section>

      <Section title="Maintenance mode" description="Visitors see a short message instead of the site. Signed-in staff still see everything.">
        <Switch checked={v.maintenance_mode} onCheckedChange={(x) => set("maintenance_mode", x)} label="Site is in maintenance" />
        <Field label="Message" optionalLabel="Optional">
          <Textarea rows={2} value={v.maintenance_message} onChange={(e) => set("maintenance_message", e.target.value)} />
        </Field>
      </Section>

      <Section title="Region and sign-in">
        <div className="grid gap-4 sm:grid-cols-3">
          {input("currency_code", "Currency", { required: true, placeholder: "LKR" })}
          {input("currency_locale", "Number format", { hint: "e.g. en-LK", required: true })}
          <Field label="Default theme">
            <Select
              value={v.default_theme}
              onChange={(e) => set("default_theme", (e.target.value || "system") as GeneralSettings["default_theme"])}
              options={[
                { value: "system", label: "Follow the device" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <Switch checked={v.auth_google_enabled} onCheckedChange={(x) => set("auth_google_enabled", x)} label="“Continue with Google”" description="Enable the Google provider in Supabase first." />
          <Switch checked={v.auth_magic_link_enabled} onCheckedChange={(x) => set("auth_magic_link_enabled", x)} label="Email sign-in links" />
        </div>
      </Section>

      <SaveBar dirty={dirty} busy={busy} onSave={save} onDiscard={() => setV(initial)} />
    </div>
  );
}
