"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "../cn";

type FieldContextValue = {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

export function useField() {
  return useContext(FieldContext);
}

/**
 * Label + control + hint + error. Controls inside pick up the id,
 * aria-describedby and aria-invalid automatically.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  optionalLabel = "Optional",
  id: idProp,
  children,
  className,
  labelAs = "label",
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  optionalLabel?: string;
  id?: string;
  children: ReactNode;
  className?: string;
  /** Use "legend" for groups (radio cards, checkbox groups); wraps in a fieldset. */
  labelAs?: "label" | "legend";
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const value = { id, describedBy, invalid: Boolean(error), required };

  const labelContent = (
    <>
      {label}
      {!required && optionalLabel ? <span className="ml-1 type-small text-ink-muted">({optionalLabel})</span> : null}
    </>
  );

  const body = (
    <>
      {hint ? (
        <p id={hintId} className="type-small text-ink-muted">
          {hint}
        </p>
      ) : null}
      <FieldContext.Provider value={value}>{children}</FieldContext.Provider>
      {error ? (
        <p id={errorId} className="type-small text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  if (labelAs === "legend") {
    return (
      <fieldset className={cn("flex min-w-0 flex-col gap-2", className)} aria-describedby={describedBy} aria-invalid={Boolean(error) || undefined}>
        <legend className="mb-2 type-label text-ink">{labelContent}</legend>
        {body}
      </fieldset>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={id} className="type-label text-ink">
        {labelContent}
      </label>
      {body}
    </div>
  );
}

const controlBase =
  "w-full min-w-0 rounded-md border border-line-strong bg-surface-raised px-3 type-body text-ink transition-hover placeholder:text-ink-muted focus-visible:border-brand focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, id, ...props }, ref) {
    const field = useField();
    return (
      <input
        ref={ref}
        id={id ?? field?.id}
        aria-describedby={props["aria-describedby"] ?? field?.describedBy}
        aria-invalid={invalid ?? field?.invalid ? true : undefined}
        aria-required={field?.required || undefined}
        className={cn(controlBase, "h-10", className)}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, id, rows = 4, ...props }, ref) {
  const field = useField();
  return (
    <textarea
      ref={ref}
      id={id ?? field?.id}
      rows={rows}
      aria-describedby={props["aria-describedby"] ?? field?.describedBy}
      aria-invalid={invalid ?? field?.invalid ? true : undefined}
      aria-required={field?.required || undefined}
      className={cn(controlBase, "min-h-24 resize-y py-2", className)}
      {...props}
    />
  );
});

export type SelectOption = { value: string; label: string; description?: string | null };

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; options: SelectOption[]; placeholder?: string }
>(function Select({ className, invalid, id, options, placeholder, ...props }, ref) {
  const field = useField();
  return (
    <div className="relative">
      <select
        ref={ref}
        id={id ?? field?.id}
        aria-describedby={props["aria-describedby"] ?? field?.describedBy}
        aria-invalid={invalid ?? field?.invalid ? true : undefined}
        aria-required={field?.required || undefined}
        className={cn(controlBase, "h-10 appearance-none pr-10", className)}
        {...props}
      >
        <option value="">{placeholder ?? "Choose one"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        size={16}
        strokeWidth={1.5}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
});

/** Styled native checkbox. */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: ReactNode; description?: ReactNode; invalid?: boolean }
>(function Checkbox({ label, description, className, invalid, id, ...props }, ref) {
  const autoId = useId();
  const field = useField();
  const inputId = id ?? (label ? autoId : field?.id);
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="relative mt-0.5 inline-flex size-5 shrink-0">
        <input
          ref={ref}
          type="checkbox"
          id={inputId}
          aria-describedby={props["aria-describedby"] ?? field?.describedBy}
          aria-invalid={invalid ?? field?.invalid ? true : undefined}
          className="peer size-5 appearance-none rounded-sm border border-line-strong bg-surface-raised transition-hover checked:border-brand checked:bg-brand focus-visible:focus-ring disabled:opacity-60 aria-invalid:border-danger"
          {...props}
        />
        <Check
          aria-hidden
          size={14}
          strokeWidth={2.25}
          className="pointer-events-none absolute inset-0 m-auto text-on-brand opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label ? (
        <label htmlFor={inputId} className="flex flex-col gap-0.5 type-body text-ink">
          <span>{label}</span>
          {description ? <span className="type-small text-ink-muted">{description}</span> : null}
        </label>
      ) : null}
    </div>
  );
});

/** Several checkboxes sharing one value array. */
export function CheckboxGroup({
  name,
  options,
  value,
  onChange,
  onBlur,
  columns = 2,
  disabled,
}: {
  name: string;
  options: SelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  columns?: 1 | 2;
  disabled?: boolean;
}) {
  const field = useField();
  return (
    <div className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2")}>
      {options.map((o, i) => {
        const checked = value.includes(o.value);
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-hover",
              checked ? "border-brand bg-brand-soft" : "border-line bg-surface-raised hover:border-line-strong",
            )}
          >
            <span className="relative mt-0.5 inline-flex size-5 shrink-0">
              <input
                type="checkbox"
                name={name}
                value={o.value}
                checked={checked}
                disabled={disabled}
                id={i === 0 ? field?.id : undefined}
                onBlur={onBlur}
                onChange={(e) =>
                  onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))
                }
                className="peer size-5 appearance-none rounded-sm border border-line-strong bg-surface-raised transition-hover checked:border-brand checked:bg-brand focus-visible:focus-ring"
              />
              <Check
                aria-hidden
                size={14}
                strokeWidth={2.25}
                className="pointer-events-none absolute inset-0 m-auto text-on-brand opacity-0 peer-checked:opacity-100"
              />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="type-body text-ink">{o.label}</span>
              {o.description ? <span className="type-small text-ink-muted">{o.description}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Radio buttons shown as selectable cards. */
export function RadioCards({
  name,
  options,
  value,
  onChange,
  onBlur,
  columns = 3,
  disabled,
  compact,
}: {
  name: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  columns?: 1 | 2 | 3;
  disabled?: boolean;
  /** Plain radio list (no card border) for simple choices. */
  compact?: boolean;
}) {
  const field = useField();
  return (
    <div
      role="radiogroup"
      aria-describedby={field?.describedBy}
      aria-invalid={field?.invalid || undefined}
      className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}
    >
      {options.map((o, i) => {
        const checked = value === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 transition-hover",
              !compact && "rounded-md border px-4 py-3",
              !compact && (checked ? "border-brand bg-brand-soft" : "border-line bg-surface-raised hover:border-line-strong"),
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              disabled={disabled}
              id={i === 0 ? field?.id : undefined}
              onBlur={onBlur}
              onChange={() => onChange(o.value)}
              className="mt-0.5 grid size-5 shrink-0 appearance-none place-content-center rounded-full border border-line-strong bg-surface-raised transition-hover before:size-2.5 before:scale-0 before:rounded-full before:bg-on-brand before:transition-transform checked:border-brand checked:bg-brand checked:before:scale-100 focus-visible:focus-ring"
            />
            <span className="flex flex-col gap-0.5">
              <span className={cn("type-body text-ink", !compact && "font-medium")}>{o.label}</span>
              {o.description ? <span className="type-small text-ink-muted">{o.description}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** On/off switch (role="switch"). */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id: idProp,
  name,
  onBlur,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  onBlur?: () => void;
}) {
  const autoId = useId();
  const field = useField();
  const id = idProp ?? field?.id ?? autoId;
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        id={id}
        name={name}
        aria-checked={checked}
        aria-describedby={field?.describedBy}
        disabled={disabled}
        onBlur={onBlur}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-ui focus-visible:focus-ring disabled:opacity-60",
          checked ? "border-brand bg-brand" : "border-line-strong bg-surface-sunk",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-4.5 rounded-full shadow-soft transition-ui",
            checked ? "translate-x-5.5 bg-on-brand" : "translate-x-0.5 bg-line-strong",
          )}
        />
      </button>
      {label ? (
        <label htmlFor={id} className="flex flex-col gap-0.5 type-body text-ink">
          <span>{label}</span>
          {description ? <span className="type-small text-ink-muted">{description}</span> : null}
        </label>
      ) : null}
    </div>
  );
}
