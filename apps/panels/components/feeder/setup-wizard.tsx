"use client";

import { Button, Card, Field, Input } from "@retexia/ui";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { finishFeederSetup, saveFeederName } from "@/app/feeder/actions";

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 type-h3 text-ink">
        {done ? <CheckCircle2 aria-hidden size={20} strokeWidth={1.5} className="text-success" /> : <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft type-small text-brand">{n}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** First visit: your name, your products and form names, your CRM sheets. Everything can be changed later. */
export function SetupWizard({ initialName, hasProducts, hasLinks, products, crm, next }: { initialName: string; hasProducts: boolean; hasLinks: boolean; products: ReactNode; crm: ReactNode; next: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    if (name.trim() && !saved) {
      const r = await saveFeederName({ name });
      if (!r.ok) {
        setBusy(false);
        return toast.error(r.message);
      }
    }
    const r = await finishFeederSetup();
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    toast.success("You're all set");
    router.push(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <Step n={1} title="Your name or shop name" done={saved}>
        <Card className="flex flex-wrap items-end gap-3">
          <Field label="Name" className="min-w-0 flex-1">
            <Input value={name} onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }} placeholder="e.g. Amaya Online Store" />
          </Field>
          <Button
            variant="secondary"
            disabled={!name.trim() || saved}
            onClick={async () => {
              const r = await saveFeederName({ name });
              toast[r.ok ? "success" : "error"](r.message ?? "");
              if (r.ok) setSaved(true);
            }}
          >
            {saved ? "Saved" : "Save"}
          </Button>
        </Card>
      </Step>
      <Step n={2} title="Your products and form names" done={hasProducts}>
        {products}
      </Step>
      <Step n={3} title="Your CRM sheets (optional)" done={hasLinks}>
        {crm}
      </Step>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" loading={busy} onClick={finish}>
          {hasProducts ? "Finish setup" : "Skip for now"}
        </Button>
        <span className="type-small text-ink-muted">You can change all of this later under My products and in Bulk import.</span>
      </div>
    </div>
  );
}
