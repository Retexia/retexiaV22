"use client";

import { Alert, Button } from "@retexia/ui";
import { CreditCard, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { startPayhere } from "@/app/(site)/account/payhere-actions";

type PayhereGlobal = {
  startPayment: (payment: Record<string, string | boolean>) => void;
  onCompleted?: (orderId: string) => void;
  onDismissed?: () => void;
  onError?: (error: string) => void;
};
declare global {
  interface Window {
    payhere?: PayhereGlobal;
  }
}

let loading: Promise<PayhereGlobal> | null = null;
function loadPayhere(): Promise<PayhereGlobal> {
  loading ??= new Promise((resolve, reject) => {
    if (window.payhere) return resolve(window.payhere);
    const s = document.createElement("script");
    s.src = "https://www.payhere.lk/lib/payhere.js";
    s.async = true;
    s.onload = () => (window.payhere ? resolve(window.payhere) : reject(new Error("PayHere missing")));
    s.onerror = () => {
      loading = null;
      reject(new Error("PayHere failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type PayherePayLabels = { pay: string; paying: string; received: string; confirming: string; secure: string; failed: string; profile: string };

/** "Pay now": PayHere's secure popup (cards; renews automatically). Refreshes until the payment is recorded. */
export function PayherePay({ refId, autoOpen, alreadyPaid, labels }: { refId: string; autoOpen: boolean; alreadyPaid: boolean; labels: PayherePayLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [paid, setPaid] = useState(alreadyPaid);
  const opened = useRef(false);

  const open = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [ph, r] = await Promise.all([loadPayhere(), startPayhere({ ref: refId })]);
      if (!r.ok) {
        setError(r.message);
        setNeedsPhone(Boolean(r.needsPhone));
        return;
      }
      ph.onCompleted = () => setPaid(true);
      ph.onDismissed = () => undefined;
      ph.onError = (e) => setError(`${labels.failed} (${e})`);
      ph.startPayment(r.data);
    } catch {
      setError(labels.failed);
    } finally {
      setBusy(false);
    }
  }, [refId, labels.failed]);

  useEffect(() => {
    if (autoOpen && !opened.current) {
      opened.current = true;
      void open();
    }
  }, [autoOpen, open]);

  // After payment: refresh every 3 s until the notification has moved the request on (up to 2 minutes).
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
      {error ? (
        <Alert tone="danger" action={needsPhone ? <Button href="/account/profile" size="sm" variant="secondary">{labels.profile}</Button> : undefined}>
          {error}
        </Alert>
      ) : null}
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
