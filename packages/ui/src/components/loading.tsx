"use client";

import { useEffect, useState } from "react";
import { cn } from "../cn";

/* ------------------------------------------------------- ProgressLine */

type FetchWatch = { pending: number; listeners: Set<(pending: number) => void> };
type WatchedWindow = Window & { __rxFetchWatch?: FetchWatch };

/** Background requests that nobody is waiting for (link prefetching on hover, beacons). */
function isBackground(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.keepalive) return true;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  return headers.has("next-router-prefetch") || headers.has("next-router-segment-prefetch") || headers.has("x-rx-quiet");
}

/**
 * Counts the requests in flight: page changes, server actions (saving,
 * deleting…), router.refresh() and API calls all go through fetch. Patched
 * once per page; the original fetch does the work.
 */
function watchFetch(): FetchWatch {
  const w = window as WatchedWindow;
  if (w.__rxFetchWatch) return w.__rxFetchWatch;
  const watch: FetchWatch = { pending: 0, listeners: new Set() };
  const emit = () => watch.listeners.forEach((l) => l(watch.pending));
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (isBackground(input, init)) return original(input, init);
    watch.pending++;
    emit();
    return original(input, init).finally(() => {
      watch.pending = Math.max(0, watch.pending - 1);
      emit();
    });
  };
  w.__rxFetchWatch = watch;
  return watch;
}

/**
 * The Retexia line at the top of the page: shows while anything the person
 * did is waiting on the server (after `delay` ms, so quick answers don't
 * flicker) and stays at least a moment so it never blinks. Mount it once per
 * app (in the providers).
 */
export function ProgressLine({ delay = 150 }: { delay?: number }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const watch = watchFetch();
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let shownAt = 0;
    const onChange = (pending: number) => {
      if (pending > 0) {
        clearTimeout(hideTimer);
        if (!showTimer && !shownAt) {
          showTimer = setTimeout(() => {
            showTimer = undefined;
            shownAt = Date.now();
            setBusy(true);
          }, delay);
        }
        return;
      }
      clearTimeout(showTimer);
      showTimer = undefined;
      if (shownAt) {
        hideTimer = setTimeout(() => {
          shownAt = 0;
          setBusy(false);
        }, Math.max(0, 400 - (Date.now() - shownAt)));
      }
    };
    watch.listeners.add(onChange);
    return () => {
      watch.listeners.delete(onChange);
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [delay]);
  return (
    <div className={cn("rx-progress", busy && "rx-progress-on")} role={busy ? "progressbar" : undefined} aria-label={busy ? "Loading" : undefined} aria-hidden={!busy}>
      <span className="rx-line-seg" />
      <span className="rx-line-seg rx-line-seg-2" />
    </div>
  );
}

/* ------------------------------------------------------ RetexiaLoader */

/** Centred "Retexia" with the line gliding under it: for pages and sections that are loading. */
export function RetexiaLoader({ label = "Loading", className, compact = false }: { label?: string; className?: string; compact?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center justify-center gap-3", compact ? "py-6" : "min-h-[40vh] py-16", className)}>
      {compact ? null : (
        <span aria-hidden className="font-display text-[20px] tracking-wide text-ink-muted">
          Retexia
        </span>
      )}
      <span aria-hidden className="rx-line-track">
        <span className="rx-line-seg" />
        <span className="rx-line-seg rx-line-seg-2" />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
