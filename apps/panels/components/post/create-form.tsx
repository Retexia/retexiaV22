"use client";

import { Alert, Button, Card, Field, RadioCards, Textarea } from "@retexia/ui";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createPost } from "@/app/post/actions";

const EXAMPLES = [
  "Weekend offer: 20% off all chocolate cakes, this Saturday and Sunday only",
  "We're open on the Poya day from 10 am to 6 pm",
  "New arrival: show our best seller and ask people to message us to order",
];

/** Asks n8n for a new photo post, then refreshes until it appears (about 1 to 2 minutes). */
export function CreateForm({ products, paused, remaining, latestCreatedAt }: { products: string[]; paused: boolean; remaining: number; latestCreatedAt: string | null }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [publish, setPublish] = useState(paused ? "draft" : "now");
  const [busy, setBusy] = useState(false);
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
        toast.info("It's taking longer than usual. It will appear in your calendar when it's done.");
        setWaitingSince(null);
      } else router.refresh();
    }, 15_000);
    return () => window.clearTimeout(t);
  }, [waiting, waitingSince, latestCreatedAt, router]);

  return (
    <Card className="flex flex-col gap-5">
      {waiting ? (
        <Alert tone="info" title="Designing your post">
          This takes about 1 to 2 minutes. You can leave this page; it will be in your calendar.
        </Alert>
      ) : null}
      {arrived ? <Alert tone="success" title="Your post is ready">It’s the first one under “Your recent requests”.</Alert> : null}
      {remaining <= 0 ? <Alert tone="warning">You&apos;ve used all your AI designs for this month. They reset on the 1st.</Alert> : null}
      <Field label="What should the post say?" hint="Mention the product, price or offer, and any dates. We only use what you write and your saved products." required>
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
      <Field label="When it's ready" labelAs="legend">
        <RadioCards
          name="publish"
          value={publish}
          onChange={setPublish}
          columns={2}
          options={[
            { value: "now", label: "Publish now", description: "Goes to Facebook and Instagram as soon as it's designed." },
            { value: "draft", label: "Let me check first", description: "Saved as ready; approve or edit it before it goes out." },
          ]}
        />
      </Field>
      {paused && publish === "now" ? <Alert tone="warning">Publishing is paused in Settings, so choose “Let me check first”.</Alert> : null}
      <Button
        size="lg"
        className="self-start"
        loading={busy}
        disabled={remaining <= 0 || waiting}
        icon={<Sparkles aria-hidden size={18} strokeWidth={1.5} />}
        onClick={async () => {
          setBusy(true);
          const r = await createPost({ prompt, publish: publish === "now" });
          setBusy(false);
          if (!r.ok) return toast.error(r.message);
          toast.success(r.message ?? "Started");
          setBaseline(latestCreatedAt);
          setWaitingSince(new Date().toISOString());
          setPrompt("");
        }}
      >
        Make my post
      </Button>
      <p className="type-caption text-ink-muted">{remaining} AI designs left this month.</p>
    </Card>
  );
}
