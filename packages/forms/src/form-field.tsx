"use client";

import { Checkbox, CheckboxGroup, Field, Input, RadioCards, Select, Switch, Textarea, cn } from "@retexia/ui";
import { Controller, type Control } from "react-hook-form";
import type { FormFieldDef, FormValues } from "./engine";
import { InlineMarkdown } from "./inline-markdown";
import { fallbackT, type Translate } from "./translate";

export const fieldDomId = (key: string) => `field-${key}`;

const inputTypes: Partial<Record<FormFieldDef["type"], { type: string; inputMode?: "email" | "tel" | "url" | "numeric" | "text"; autoComplete?: string }>> = {
  text: { type: "text" },
  email: { type: "email", inputMode: "email", autoComplete: "email" },
  phone: { type: "tel", inputMode: "tel", autoComplete: "tel" },
  url: { type: "url", inputMode: "url", autoComplete: "url" },
  number: { type: "number", inputMode: "numeric" },
};

/** Renders one database-defined field as the right control. */
export function FormField({
  field,
  control,
  error,
  onEdited,
  t = fallbackT,
}: {
  field: FormFieldDef;
  control: Control<FormValues>;
  error?: string;
  /** Called after every change, e.g. to clear this field's error. */
  onEdited?: (key: string) => void;
  /** site_strings lookup for "Optional" / "Choose one". */
  t?: Translate;
}) {
  const id = fieldDomId(field.key);
  const optional = t("form.optional", "Optional");
  const hint = field.help_text ? <InlineMarkdown text={field.help_text} /> : undefined;
  const label = <InlineMarkdown text={field.label} />;
  const wrapper = cn(field.width === "half" ? "sm:col-span-1" : "sm:col-span-2");

  return (
    <Controller
      control={control}
      name={field.key}
      render={({ field: rhf }) => {
        const value = rhf.value;
        const change = (next: FormValues[string]) => {
          rhf.onChange(next);
          onEdited?.(field.key);
        };
        switch (field.type) {
          case "textarea":
            return (
              <Field id={id} label={label} hint={hint} error={error} required={field.required} optionalLabel={optional} className={wrapper}>
                <Textarea
                  ref={rhf.ref}
                  name={rhf.name}
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => change(e.target.value)}
                  onBlur={rhf.onBlur}
                  placeholder={field.placeholder ?? undefined}
                  maxLength={field.max ?? 5000}
                  rows={4}
                />
              </Field>
            );
          case "select":
            return (
              <Field id={id} label={label} hint={hint} error={error} required={field.required} optionalLabel={optional} className={wrapper}>
                <Select
                  ref={rhf.ref}
                  name={rhf.name}
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => change(e.target.value)}
                  onBlur={rhf.onBlur}
                  options={field.options}
                  placeholder={field.placeholder ?? t("form.choose", "Choose one")}
                />
              </Field>
            );
          case "radio":
          case "radio_cards":
            return (
              <Field id={id} labelAs="legend" label={label} hint={hint} error={error} required={field.required} optionalLabel={optional} className={wrapper}>
                <RadioCards
                  name={rhf.name}
                  options={field.options}
                  value={typeof value === "string" ? value : ""}
                  onChange={change}
                  onBlur={rhf.onBlur}
                  compact={field.type === "radio"}
                  columns={field.type === "radio" ? 1 : field.options.length >= 3 ? 3 : 2}
                />
              </Field>
            );
          case "checkbox_group":
            return (
              <Field id={id} labelAs="legend" label={label} hint={hint} error={error} required={field.required} optionalLabel={optional} className={wrapper}>
                <CheckboxGroup
                  name={rhf.name}
                  options={field.options}
                  value={Array.isArray(value) ? value : []}
                  onChange={change}
                  onBlur={rhf.onBlur}
                />
              </Field>
            );
          case "checkbox":
            return (
              <div className={cn("flex flex-col gap-2", wrapper)}>
                <Checkbox
                  id={id}
                  ref={rhf.ref}
                  name={rhf.name}
                  checked={value === true}
                  onChange={(e) => change(e.target.checked)}
                  onBlur={rhf.onBlur}
                  invalid={Boolean(error)}
                  aria-describedby={error ? `${id}-error` : undefined}
                  label={label}
                  description={hint}
                />
                {error ? (
                  <p id={`${id}-error`} role="alert" className="pl-8 type-small text-danger">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          case "toggle":
            return (
              <div className={cn("flex flex-col gap-2 self-center", wrapper)}>
                <Switch
                  id={id}
                  name={rhf.name}
                  checked={value === true}
                  onCheckedChange={change}
                  onBlur={rhf.onBlur}
                  label={label}
                  description={hint}
                />
              </div>
            );
          default: {
            const cfg = inputTypes[field.type] ?? { type: "text" };
            return (
              <Field id={id} label={label} hint={hint} error={error} required={field.required} optionalLabel={optional} className={wrapper}>
                <Input
                  ref={rhf.ref}
                  name={rhf.name}
                  type={cfg.type}
                  inputMode={cfg.inputMode}
                  autoComplete={cfg.autoComplete}
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => change(e.target.value)}
                  onBlur={rhf.onBlur}
                  placeholder={field.placeholder ?? undefined}
                  maxLength={field.type === "number" ? undefined : (field.max ?? 500)}
                  min={field.type === "number" ? (field.min ?? undefined) : undefined}
                  max={field.type === "number" ? (field.max ?? undefined) : undefined}
                />
              </Field>
            );
          }
        }
      }}
    />
  );
}
