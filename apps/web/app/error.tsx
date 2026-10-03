"use client";

import { Button } from "@retexia/ui";
import { useEffect } from "react";
import { useT } from "@/lib/strings-context";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="flex min-h-[60dvh] items-center justify-center px-gutter py-24">
      <div className="flex max-w-content flex-col items-center gap-4 text-center">
        <p className="type-eyebrow text-danger">{t("error.500.eyebrow", "Something went wrong")}</p>
        <h1 className="type-display text-ink">{t("error.500.title", "We hit a small bump")}</h1>
        <p className="max-w-measure type-body-lg text-ink-muted">
          {t("error.500.text", "Please try again. If it keeps happening, message us and we will sort it out.")}
        </p>
        {error.digest ? <p className="type-code text-ink-muted">{error.digest}</p> : null}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={() => reset()}>
            {t("error.500.retry", "Try again")}
          </Button>
          <Button href="/" variant="secondary" size="lg">
            {t("error.404.home", "Go to the home page")}
          </Button>
        </div>
      </div>
    </main>
  );
}
