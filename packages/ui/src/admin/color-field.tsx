"use client";

import { useId } from "react";
import { cn } from "../cn";

/** Colour picker with a hex text box. */
export function ColorField({
  label,
  value,
  onChange,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={`${id}-text`} className="type-label text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-line-strong bg-surface-raised p-1"
        />
        <input
          id={`${id}-text`}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          spellCheck={false}
          aria-invalid={!valid || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-10 w-full min-w-0 rounded-md border border-line-strong bg-surface-raised px-3 font-mono text-[13px] text-ink focus-visible:border-brand focus-visible:focus-ring aria-invalid:border-danger"
        />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="type-small text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
