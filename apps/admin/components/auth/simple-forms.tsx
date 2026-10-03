"use client";

import { Alert, Button, Field, Input } from "@retexia/ui";
import { useState, type FormEvent } from "react";
import { requestPasswordReset, setPassword } from "@/app/(auth)/actions";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setResult(await requestPasswordReset({ email }));
    setPending(false);
  }
  if (result?.ok) return <Alert tone="success">{result.message}</Alert>;
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {result && !result.ok ? <Alert tone="danger">{result.message}</Alert> : null}
      <Field label="Email" required>
        <Input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Send reset link
      </Button>
    </form>
  );
}

export function SetPasswordForm() {
  const [password, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setPending(true);
    const result = await setPassword({ password });
    setPending(false);
    if (result && !result.ok) setError(result.message);
  }
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="New password" hint="At least 10 characters, with letters and numbers." required>
        <Input type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="Confirm password" required>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" fullWidth loading={pending}>
        Save password
      </Button>
    </form>
  );
}
