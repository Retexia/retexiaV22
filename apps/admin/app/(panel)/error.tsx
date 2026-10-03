"use client";

import { Alert, Button } from "@retexia/ui";
import { useEffect } from "react";

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-content flex-col gap-4 py-12">
      <Alert tone="danger" title="This page couldn't load" action={<Button size="sm" onClick={() => reset()}>Try again</Button>}>
        {error.message || "Something went wrong."}
        {error.digest ? <span className="mt-1 block type-code">Ref: {error.digest}</span> : null}
      </Alert>
    </div>
  );
}
