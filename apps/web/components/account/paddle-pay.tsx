"use client";

import { Alert, Button } from "@retexia/ui";
import { CreditCard, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { startCheckout } from "@/app/(site)/account/billing-actions";

type PaddleEvent = { name?: string };
type PaddleGlobal = {
  Environment: { set: (env: string) => void };
  Initialize: (o: { token: string; eventCallback?: (e: PaddleEvent) => void }) => void;
  Checkout: { open: (o: Record<string, unknown>) => void; close: () => void };
};
declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

let listener: ((e: PaddleEvent) => void) | null = null;
let ready: Promise<PaddleGlobal> | null = null;

/** Loads Paddle.js once per page and initialises it with the public client token. */
export function loadPaddle(env: string, token: string): Promise<PaddleGlobal> {
  ready ??= new Promise((resolve, reject) => {
    const init = () => {
      const P = window.Paddle;
      if (!P) return reject(new Error("Paddle.js missing"));
      if (env === "sandbox") P.Environment.set("sandbox");
      P.Initialize({ token, eventCallback: (e) => listener?.(e) });
      resolve(P);
    };
    if (window.Paddle) return init();
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.async = true;
    s.onload = init;
    s.onerror = () => {
      ready = null;
      reject(new Error("Paddle.js failed to load"));
    };
    document.head.appendChild(s);
  });
  return ready;
}

export type PaddlePayLabels = { pay: string; paying: string; received: string; confirming: string; secure: string; failed: string };

/**
 * "Pay now": opens Paddle's checkout (card, Apple Pay, Google Pay, PayPal) for
 * the request. After payment, refreshes until the webhook has recorded it.
 */
export function PaddlePay({ refId, env, token, autoOpen, labels }: { refId: string; env: string; token: string; autoOpen: boolean; labels: PaddlePayLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const opened = useRef(false);

  const open = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [P, r] = await Promise.all([loadPaddle(env, token), startCheckout({ ref: refId })]);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      listener = (e) => {
        if (e.name === "checkout.completed") setPaid(true);
      };
      const dark = document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark";
      P.Checkout.open({
        transactionId: r.data.transactionId,
        ...(r.data.email ? { customer: { email: r.data.email } } : {}),
        settings: { displayMode: "overlay", theme: dark ? "dark" : "light", locale: "en", allowLogout: false },
      });
    } catch {
      setError(labels.failed);
    } finally {
      setBusy(false);
    }
  }, [env, token, refId, labels.failed]);

  useEffect(() => {
    if (autoOpen && !opened.current) {
      opened.current = true;
      void open();
    }
  }, [autoOpen, open]);

  // After payment: refresh every 3 s until the webhook has moved the request on (up to 2 minutes).
  useEffect(() => {
    if (!paid) return;
    let n = 0;
    const id = window.setInterval(() => {
      n++;
      router.refresh();
      if (n > 40) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [paid, router]);

  if (paid) {
    return (
      <Alert tone="success" title={labels.received}>
        {labels.confirming}
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" loading={busy} icon={<CreditCard aria-hidden size={18} strokeWidth={1.5} />} onClick={() => void open()}>
          {busy ? labels.paying : labels.pay}
        </Button>
        <span className="flex items-center gap-1.5 type-small text-ink-muted">
          <Lock aria-hidden size={14} strokeWidth={1.5} />
          {labels.secure}
        </span>
      </div>
    </div>
  );
}
