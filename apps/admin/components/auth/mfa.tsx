"use client";

import { createBrowserClient } from "@retexia/supabase/browser";
import { Alert, Button, Field, Input, Skeleton } from "@retexia/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

function CodeForm({ onVerify, submitLabel }: { onVerify: (code: string) => Promise<string | null>; submitLabel: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setPending(true);
    setError(await onVerify(code));
    setPending(false);
  }
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="6-digit code" required>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="text-center font-mono text-[20px] tracking-[0.4em]"
        />
      </Field>
      <Button type="submit" size="lg" fullWidth loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

/** First-time TOTP enrolment: QR code, manual key, confirm with a code. */
export function MfaSetup({ next, onDone }: { next: string; /** Called instead of navigating when set (e.g. adding a second factor). */ onDone?: () => void | Promise<void> }) {
  const router = useRouter();
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createBrowserClient();
      // Remove half-finished enrolments so a fresh QR code can be made.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Retexia admin ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      });
      if (!active) return;
      if (enrollError || !data) setError(enrollError?.message ?? "Could not start two-step sign-in. Is MFA enabled in Supabase Auth?");
      else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!factor) {
    return (
      <div className="flex flex-col items-center gap-4" aria-busy="true">
        <Skeleton className="size-44" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ol className="flex list-decimal flex-col gap-2 pl-5 type-body text-ink-muted">
        <li>Open an authenticator app (Google Authenticator, 1Password, Authy…).</li>
        <li>Scan this code, or type the key below.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG data URL from Supabase */}
        <img src={factor.qr} alt="QR code for your authenticator app" width={176} height={176} className="rounded-md bg-white p-2" />
        <code className="rounded-sm bg-surface-sunk px-2 py-1 type-code break-all text-ink select-all">{factor.secret}</code>
      </div>
      <CodeForm
        submitLabel="Turn on two-step sign-in"
        onVerify={async (code) => {
          const { error: verifyError } = await createBrowserClient().auth.mfa.challengeAndVerify({ factorId: factor.id, code });
          if (verifyError) return "That code didn't work. Check the time on your phone and try the newest code.";
          if (onDone) {
            await onDone();
            return null;
          }
          router.replace(next);
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}

/** Each new session: enter a code from the enrolled authenticator. */
export function MfaVerify({ next }: { next: string }) {
  const router = useRouter();
  return (
    <CodeForm
      submitLabel="Continue"
      onVerify={async (code) => {
        const supabase = createBrowserClient();
        const { data } = await supabase.auth.mfa.listFactors();
        const factor = data?.totp.find((f) => f.status === "verified");
        if (!factor) return "No authenticator is set up for this account.";
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (error) return "That code didn't work. Try the newest code.";
        router.replace(next);
        router.refresh();
        return null;
      }}
    />
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await createBrowserClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
