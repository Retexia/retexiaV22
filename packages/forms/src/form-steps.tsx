"use client";

import type { Control, FieldErrors, UseFormClearErrors, UseFormSetError } from "react-hook-form";
import { buildSchema, visibleFields, type FormStepDef, type FormValues, type ValidationMessages } from "./engine";
import { FormField, fieldDomId } from "./form-field";
import type { Translate } from "./translate";

/** The visible fields of one step, in the two-column form grid. */
export function FormStepFields({
  step,
  values,
  control,
  errors,
  clearErrors,
  t,
}: {
  step: FormStepDef;
  values: FormValues;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
  clearErrors: UseFormClearErrors<FormValues>;
  t?: Translate;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {visibleFields(step, values).map((field) => (
        <FormField
          key={field.id}
          field={field}
          control={control}
          t={t}
          error={errors[field.key]?.message as string | undefined}
          onEdited={(name) => {
            if (errors[name]) clearErrors(name);
          }}
        />
      ))}
    </div>
  );
}

/**
 * Validate the visible fields of a step with the zod schema built from their
 * definitions. Sets react-hook-form errors and focuses the first invalid
 * field. Returns true when the step is valid.
 */
export function validateFormStep(
  step: FormStepDef | undefined,
  values: FormValues,
  messages: ValidationMessages,
  setError: UseFormSetError<FormValues>,
  clearErrors: UseFormClearErrors<FormValues>,
): boolean {
  if (!step) return true;
  const result = buildSchema(visibleFields(step, values), messages).safeParse(values);
  clearErrors();
  if (result.success) return true;
  let first: string | null = null;
  for (const issue of result.error.issues) {
    const name = String(issue.path[0]);
    first ??= name;
    setError(name, { type: "validate", message: issue.message });
  }
  if (first && typeof document !== "undefined") {
    const el = document.getElementById(fieldDomId(first));
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  return false;
}
