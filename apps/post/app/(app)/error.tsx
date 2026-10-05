"use client";

import { Alert, Button } from "@retexia/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Alert tone="danger" title="Something went wrong" action={<Button size="sm" variant="secondary" onClick={reset}>Try again</Button>}>
      We couldn&apos;t load this page. If it keeps happening, message Retexia.
    </Alert>
  );
}
