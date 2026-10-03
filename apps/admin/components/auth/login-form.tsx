"use client";

import { Alert, Button, Field, Input } from "@retexia/ui";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { sendMagicLink, signIn } from "@/app/(auth)/actions";

export function LoginForm({ next }: { next: string | null }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = mode === "password" ? await signIn({ email, password, next }) : await sendMagicLink({ email, next });
    setPending(false);
    if (!result) return;
    if (result.ok) setSent(result.message ?? "Check your email.");
    else setError(result.message);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Check your email">
          {sent}
        </Alert>
        <Button variant="ghost" onClick={() => setSent(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Email" required>
        <Input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {mode === "password" ? (
        <>
          <Field label="Password" required>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Link href="/forgot-password" className="-mt-2 self-end rounded-sm type-small text-link hover:text-brand-hover focus-visible:focus-ring">
            Forgot your password?
          </Link>
        </>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={pending}>
        {mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setMode(mode === "password" ? "magic" : "password");
        }}
        className="self-center rounded-sm type-label text-link hover:text-brand-hover focus-visible:focus-ring"
      >
        {mode === "password" ? "Email me a sign-in link instead" : "Sign in with a password instead"}
      </button>
    </form>
  );
}
