"use client";

import { Button, Card, Field, Input, Select, Switch, Textarea } from "@retexia/ui";
import { ColorField } from "@retexia/ui/admin";
import { Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveBrand, uploadLogo } from "@/app/post/actions";
import { photoForm } from "@/lib/resize";

type BrandValue = {
  colors: string[];
  font: string;
  template: string;
  tone: { formal_casual: number; calm_energetic: number };
  emoji: boolean;
  always_words: string[];
  never_words: string[];
  sample_posts: string[];
  contact: { phone: string; website: string; address: string; instagram: string };
  brand_brief: string;
};

const FONTS = ["Modern sans-serif", "Classic serif", "Rounded and friendly", "Bold and condensed", "Handwritten"].map((v) => ({ value: v, label: v }));
const TEMPLATES = ["Clean and minimal", "Bold colour blocks", "Photo first", "Elegant", "Playful"].map((v) => ({ value: v, label: v }));

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

const list = (s: string) => s.split(",").map((w) => w.trim()).filter(Boolean);

export function BrandForm({ initial, logoUrl }: { initial: BrandValue; logoUrl: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [always, setAlways] = useState(initial.always_words.join(", "));
  const [never, setNever] = useState(initial.never_words.join(", "));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-6">
      <Section title="Look" description="Your logo goes small in a corner of new designs. Colours and style guide the design.">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-sunk">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
            {logoUrl ? <img src={logoUrl} alt="Your logo" className="size-full object-contain" /> : <span className="type-caption text-ink-muted">No logo</span>}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setUploading(true);
              try {
                const r = await uploadLogo(await photoForm(f));
                toast[r.ok ? "success" : "error"](r.message ?? "");
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not upload");
              }
              setUploading(false);
            }}
          />
          <Button variant="secondary" loading={uploading} icon={<Upload aria-hidden size={16} strokeWidth={1.5} />} onClick={() => fileRef.current?.click()}>
            {logoUrl ? "Change logo" : "Upload logo"}
          </Button>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 type-label text-ink">Brand colours</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {v.colors.map((c, i) => (
              <div key={i} className="flex items-end gap-2">
                <ColorField label={`Colour ${i + 1}`} value={c} onChange={(x) => setV({ ...v, colors: v.colors.map((y, j) => (j === i ? x : y)) })} className="flex-1" />
                <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setV({ ...v, colors: v.colors.filter((_, j) => j !== i) })}>
                  <span className="sr-only">Remove colour</span>
                </Button>
              </div>
            ))}
          </div>
          {v.colors.length < 5 ? (
            <Button size="sm" variant="ghost" className="self-start" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setV({ ...v, colors: [...v.colors, "#2a68d9"] })}>
              Add colour
            </Button>
          ) : null}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lettering style" optionalLabel="Optional">
            <Select value={v.font} onChange={(e) => setV({ ...v, font: e.target.value })} options={FONTS} placeholder="Let the AI choose" />
          </Field>
          <Field label="Design style" optionalLabel="Optional">
            <Select value={v.template} onChange={(e) => setV({ ...v, template: e.target.value })} options={TEMPLATES} placeholder="Let the AI choose" />
          </Field>
        </div>
      </Section>

      <Section title="Voice" description="How the captions sound.">
        {(
          [
            ["formal_casual", "Formal", "Casual"],
            ["calm_energetic", "Calm", "Energetic"],
          ] as const
        ).map(([k, left, right]) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="flex justify-between type-small text-ink-muted">
              <span>{left}</span>
              <span>{right}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={v.tone[k]}
              aria-label={`${left} to ${right}`}
              onChange={(e) => setV({ ...v, tone: { ...v.tone, [k]: Number(e.target.value) } })}
              className="accent-[var(--rx-brand)]"
            />
          </label>
        ))}
        <Switch checked={v.emoji} onCheckedChange={(emoji) => setV({ ...v, emoji })} label="Use a few emoji" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Words to use" hint="Separated by commas." optionalLabel="Optional">
            <Input value={always} onChange={(e) => setAlways(e.target.value)} placeholder="homemade, fresh daily" />
          </Field>
          <Field label="Never use" hint="Separated by commas." optionalLabel="Optional">
            <Input value={never} onChange={(e) => setNever(e.target.value)} placeholder="cheap, best in town" />
          </Field>
        </div>
      </Section>

      <Section title="Contact details" description="Only these are ever put on a design or in a caption.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone or WhatsApp" optionalLabel="Optional">
            <Input value={v.contact.phone} onChange={(e) => setV({ ...v, contact: { ...v.contact, phone: e.target.value } })} />
          </Field>
          <Field label="Website" optionalLabel="Optional">
            <Input value={v.contact.website} onChange={(e) => setV({ ...v, contact: { ...v.contact, website: e.target.value } })} />
          </Field>
          <Field label="Address" optionalLabel="Optional">
            <Input value={v.contact.address} onChange={(e) => setV({ ...v, contact: { ...v.contact, address: e.target.value } })} />
          </Field>
          <Field label="Instagram handle" optionalLabel="Optional">
            <Input value={v.contact.instagram} onChange={(e) => setV({ ...v, contact: { ...v.contact, instagram: e.target.value } })} placeholder="@yourbusiness" />
          </Field>
        </div>
      </Section>

      <Section title="Posts you like" description="Paste 3 to 5 past posts you were happy with. The AI copies their style, not their words.">
        {v.sample_posts.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <Textarea aria-label={`Sample post ${i + 1}`} rows={3} value={s} onChange={(e) => setV({ ...v, sample_posts: v.sample_posts.map((y, j) => (j === i ? e.target.value : y)) })} />
            <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setV({ ...v, sample_posts: v.sample_posts.filter((_, j) => j !== i) })}>
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        ))}
        {v.sample_posts.length < 5 ? (
          <Button size="sm" variant="ghost" className="self-start" icon={<Plus aria-hidden size={14} strokeWidth={1.5} />} onClick={() => setV({ ...v, sample_posts: [...v.sample_posts, ""] })}>
            Add a post
          </Button>
        ) : null}
      </Section>

      <Section title="About your business" description="A short summary sent with every post request: what you sell, who your customers are, what makes you different.">
        <Textarea rows={6} value={v.brand_brief} maxLength={3000} onChange={(e) => setV({ ...v, brand_brief: e.target.value })} />
        <p className="type-caption text-ink-muted">{v.brand_brief.trim().split(/\s+/).filter(Boolean).length} words (about 300 is ideal)</p>
      </Section>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button
          size="lg"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = await saveBrand({ ...v, always_words: list(always), never_words: list(never), sample_posts: v.sample_posts.map((s) => s.trim()).filter(Boolean) });
            setBusy(false);
            toast[r.ok ? "success" : "error"](r.message ?? "");
            if (r.ok) router.refresh();
          }}
        >
          Save brand
        </Button>
      </div>
    </div>
  );
}
