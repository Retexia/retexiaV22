"use client";

import { Button } from "@retexia/ui";
import { useUnsavedChanges } from "@retexia/ui/admin";

/** Sticky "Unsaved changes · Discard · Save" bar used by the settings forms. */
export function SaveBar({ dirty, busy, onSave, onDiscard, label = "Save" }: { dirty: boolean; busy: boolean; onSave: () => void; onDiscard: () => void; label?: string }) {
  useUnsavedChanges(dirty);
  return (
    <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-full border border-line bg-surface-raised/95 px-4 py-2 shadow-float backdrop-blur">
      <span className="type-small text-ink-muted" aria-live="polite">
        {dirty ? "Unsaved changes" : "All changes saved"}
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={!dirty || busy} onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" loading={busy} disabled={!dirty} onClick={onSave}>
          {label}
        </Button>
      </div>
    </div>
  );
}
