"use client";

import "./globals.css";

/** Last-resort error page (the root layout itself failed). Plain text, no data. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-surface font-sans text-ink">
        <main className="flex min-h-dvh items-center justify-center px-6">
          <div className="flex max-w-[480px] flex-col items-center gap-4 text-center">
            <h1 className="text-[30px] leading-[38px] font-light">We hit a small bump</h1>
            <p className="text-[16px] leading-[26px] text-ink-muted">Please try again in a moment.</p>
            <button
              type="button"
              onClick={() => reset()}
              className="h-12 rounded-full bg-brand px-6 text-[14px] font-medium text-on-brand"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
