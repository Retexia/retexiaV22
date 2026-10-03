"use client";

import { Button, Input } from "@retexia/ui";
import { CircleCheck } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { joinWaitlist } from "@/app/(site)/actions";
import { useT } from "@/lib/strings-context";

export function WaitlistForm({ productId }: { productId: string }) {
  const t = useT();
  const id = useId();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t("form.error.email", "Enter a valid email address"));
      return;
    }
    setPending(true);
    const result = await joinWaitlist({ product_id: productId, email, website });
    setPending(false);
    if (result.ok) {
      setDone(result.message);
      toast.success(result.message);
    } else {
      setError(result.fieldErrors?.email ?? result.message);
    }
  }

  if (done) {
    return (
      <p role="status" className="inline-flex items-center gap-2 rounded-full bg-success-soft px-4 py-2 type-label text-success">
        <CircleCheck aria-hidden size={18} strokeWidth={1.5} />
        {done}
      </p>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-2 text-left">
      <label htmlFor={`${id}-email`} className="sr-only">
        {t("waitlist.email_label", "Email address")}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t("waitlist.placeholder", "you@business.lk")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-12 sm:flex-1"
        />
        <Button type="submit" size="lg" loading={pending}>
          {t("waitlist.submit", "Join the waitlist")}
        </Button>
      </div>
      <input
        type="text"
        tabIndex={-1}
        aria-hidden
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="type-small text-danger">
          {error}
        </p>
      ) : (
        <p className="type-small text-ink-muted">{t("waitlist.privacy", "One email when it launches. No spam.")}</p>
      )}
    </form>
  );
}
