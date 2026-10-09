"use client";

import { Alert, Button, Card, Field, Input, RadioCards, Select, Textarea } from "@retexia/ui";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createPost } from "@/app/post/playlist-actions";
import { CAPTION_LANGUAGES, DESIGN_LANGUAGES } from "@/lib/post/languages";

const EXAMPLES = [
  "Weekend offer: 20% off all chocolate cakes, this Saturday and Sunday only",
  "පෝය දිනයේ උදේ 10 සිට හවස 6 දක්වා විවෘතයි",
  "New arrival: show our best seller and ask people to message us to order",
];

/** A post or story made by hand: n8n designs it, then it publishes now or at the chosen time. */
export function CreateForm({
  products,
  paused,
  remaining,
  latestCreatedAt,
  defaults,
  today,
}: {
  products: string[];
  paused: boolean;
  remaining: number;
  latestCreatedAt: string | null;
  defaults: { caption: string; design: string };
  today: string;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<"post" | "story">("post");
  const [caption, setCaption] = useState(defaults.caption);
  const [design, setDesign] = useState(defaults.design);
  const [when, setWhen] = useState(paused ? "later" : "now");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("18:00");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [waitingSince, setWaitingSince] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(latestCreatedAt);

  // While a design is being made, refresh every 15 seconds (up to 4 minutes) until it shows up.
  const arrived = Boolean(waitingSince) && latestCreatedAt !== baseline;
  const waiting = Boolean(waitingSince) && !arrived;
  useEffect(() => {
    if (!waiting || !waitingSince) return;
    const started = new Date(waitingSince).getTime();
    const t = window.setTimeout(() => {
      if (Date.now() - started > 4 * 60_000) {
        toast.info("It's taking longer than usual. It will appear in your playlist when it's done.");
        setWaitingSince(null);
      } else router.refresh();
    }, 15_000);
    return () => window.clearTimeout(t);
  }, [waiting, waitingSince, latestCreatedAt, router]);

  return (
    <Card className="flex flex-col gap-5">
      {waiting ? (
        <Alert tone="info" title={`Designing your ${format}`}>
          This takes about 1 to 2 minutes. You can leave this page; it appears in your playlist.
        </Alert>
      ) : null}
      {arrived ? <Alert tone="success" title="It's ready">It&apos;s the first one under &ldquo;Made by you&rdquo; below.</Alert> : null}
      {remaining <= 0 ? <Alert tone="warning">You&apos;ve used all your AI designs for this month. They reset on the 1st.</Alert> : null}

      <Field label="Post or story?" labelAs="legend">
        <RadioCards
          name="format"
          value={format}
          onChange={(v) => setFormat(v as "post" | "story")}
          columns={2}
          compact
          options={[
            { value: "post", label: "Post", description: "4:5 picture with a caption, in the feed." },
            { value: "story", label: "Story", description: "Full-screen 9:16, visible for 24 hours." },
          ]}
        />
      </Field>
      <Field label="What should it say?" hint="The product, the price or offer, any dates. Write in Sinhala, English or Tamil: we only use what you write and your saved products." error={errors.prompt} required>
        <Textarea rows={4} value={prompt} maxLength={1500} onChange={(e) => setPrompt(e.target.value)} placeholder={EXAMPLES[0]} />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="type-small text-ink-muted">Ideas</span>
        <div className="flex flex-wrap gap-2">
          {[...EXAMPLES.slice(1), ...products.slice(0, 6).map((p) => `Show ${p} and ask people to message us to order`)].map((e) => (
            <button key={e} type="button" onClick={() => setPrompt(e)} className="rounded-full border border-line px-3 py-1 text-left type-small text-ink-muted transition-hover hover:border-brand hover:text-ink focus-visible:focus-ring">
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {format === "post" ? (
          <Field label="Caption in">
            <Select value={caption} onChange={(e) => setCaption(e.target.value || caption)} options={CAPTION_LANGUAGES.map((l) => ({ value: l.value, label: l.label }))} />
          </Field>
        ) : null}
        <Field label="Text on the picture in">
          <Select value={design} onChange={(e) => setDesign(e.target.value || design)} options={DESIGN_LANGUAGES.map((l) => ({ value: l.value, label: l.label }))} />
        </Field>
      </div>
      <Field label="When" labelAs="legend">
        <RadioCards
          name="when"
          value={when}
          onChange={setWhen}
          columns={2}
          options={[
            { value: "now", label: "Publish now", description: "Goes to Facebook and Instagram as soon as it's designed." },
            { value: "later", label: "At a time", description: "Ready for you to check; it goes out at the time you pick." },
          ]}
        />
      </Field>
      {when === "later" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Day">
            <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time" error={errors.time}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
      ) : null}
      {paused && when === "now" ? <Alert tone="warning">Publishing is paused in Settings, so choose &ldquo;At a time&rdquo;.</Alert> : null}
      <Button
        size="lg"
        className="self-start"
        loading={busy}
        disabled={remaining <= 0 || waiting}
        icon={<Sparkles aria-hidden size={18} strokeWidth={1.5} />}
        onClick={async () => {
          setBusy(true);
          const r = await createPost({ prompt, format, caption_language: caption, design_language: design, when: when as "now" | "later", date: when === "later" ? date : undefined, time: when === "later" ? time : undefined });
          setBusy(false);
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            toast.error(r.message);
            return;
          }
          setErrors({});
          toast.success(r.message ?? "Started");
          setBaseline(latestCreatedAt);
          setWaitingSince(new Date().toISOString());
          setPrompt("");
        }}
      >
        Make my {format}
      </Button>
      <p className="type-caption text-ink-muted">{remaining} AI designs left this month.</p>
    </Card>
  );
}
