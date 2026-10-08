"use client";

import { Alert } from "@retexia/ui";
import { useEffect, useState } from "react";
import { loadPaddle } from "./paddle-pay";

/** Paddle's default payment link: Paddle.js opens the checkout for the ?_ptxn= transaction by itself. */
export function PaddleLinkCheckout({ env, token, hasTransaction, labels }: { env: string; token: string; hasTransaction: boolean; labels: { opening: string; missing: string; failed: string } }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!hasTransaction) return;
    loadPaddle(env, token).then(
      () => undefined,
      () => setFailed(true),
    );
  }, [env, token, hasTransaction]);
  if (!hasTransaction) return <Alert tone="warning">{labels.missing}</Alert>;
  return <Alert tone={failed ? "warning" : "info"}>{failed ? labels.failed : labels.opening}</Alert>;
}
