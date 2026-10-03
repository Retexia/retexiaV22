/**
 * Generic onboarding form engine, shared by the browser (react-hook-form) and
 * the server action (re-validation). A form is data: forms → form_steps →
 * form_fields in Supabase. Nothing here knows about any specific product.
 */
import { z } from "zod";

export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "url",
  "select",
  "radio",
  "radio_cards",
  "checkbox_group",
  "checkbox",
  "toggle",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldOption = { value: string; label: string; description?: string | null };
export type ShowIf = { field: string; in?: string[]; equals?: string | boolean; not_in?: string[] };
export type PrefillSource = "profile.full_name" | "profile.phone" | "profile.whatsapp" | "profile.business_name" | "user.email";

export type FormFieldDef = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  placeholder: string | null;
  help_text: string | null;
  options: FieldOption[];
  required: boolean;
  min: number | null;
  max: number | null;
  default_value: string | null;
  show_if: ShowIf | null;
  width: "full" | "half";
  prefill_from: PrefillSource | null;
};

export type FormStepDef = {
  id: string;
  step_number: number;
  title: string;
  description: string | null;
  fields: FormFieldDef[];
};

export type FormDef = {
  id: string;
  slug: string;
  product_id: string | null;
  title: string;
  description: string | null;
  submit_label: string | null;
  success_title: string | null;
  success_message: string | null;
  version: number;
  steps: FormStepDef[];
};

export type FieldValue = string | string[] | boolean;
export type FormValues = Record<string, FieldValue>;

export type Answer = {
  key: string;
  label: string;
  value: FieldValue;
  display_value: string;
  step: string;
};

export type ValidationMessages = {
  required: string;
  email: string;
  phone: string;
  url: string;
  number: string;
  tooShort: (min: number) => string;
  tooLong: (max: number) => string;
  tooSmall: (min: number) => string;
  tooLarge: (max: number) => string;
  chooseAtLeast: (min: number) => string;
  chooseAtMost: (max: number) => string;
  invalidOption: string;
};

export const defaultMessages: ValidationMessages = {
  required: "Please fill this in",
  email: "Enter a valid email address",
  phone: "Enter a valid phone number, like +94 77 123 4567",
  url: "Enter a full link, like https://example.com",
  number: "Enter a number",
  tooShort: (n) => `Use at least ${n} characters`,
  tooLong: (n) => `Use at most ${n} characters`,
  tooSmall: (n) => `Enter ${n} or more`,
  tooLarge: (n) => `Enter ${n} or less`,
  chooseAtLeast: (n) => `Choose at least ${n}`,
  chooseAtMost: (n) => `Choose at most ${n}`,
  invalidOption: "Choose one of the options",
};

/* ------------------------------------------------------------- parsing --- */

const optionSchema = z.object({
  value: z.coerce.string(),
  label: z.coerce.string(),
  description: z.string().nullish(),
});

const showIfSchema = z
  .object({
    field: z.string(),
    in: z.array(z.coerce.string()).optional(),
    not_in: z.array(z.coerce.string()).optional(),
    equals: z.union([z.string(), z.boolean()]).optional(),
  })
  .nullable()
  .catch(null);

type RawField = {
  id: string;
  key: string;
  label: string;
  type: string;
  placeholder: string | null;
  help_text: string | null;
  options: unknown;
  required: boolean;
  min: number | null;
  max: number | null;
  default_value: string | null;
  show_if: unknown;
  width: string;
  prefill_from: string | null;
  sort_order: number;
  is_visible?: boolean;
};

type RawStep = {
  id: string;
  step_number: number;
  title: string;
  description: string | null;
  sort_order: number;
  is_visible?: boolean;
  fields: RawField[] | null;
};

type RawForm = Omit<FormDef, "steps"> & { steps: RawStep[] | null };

/** Turn the nested Supabase rows into a clean, ordered form definition. */
export function parseForm(raw: RawForm): FormDef {
  const steps = [...(raw.steps ?? [])]
    .filter((s) => s.is_visible !== false)
    .sort((a, b) => a.sort_order - b.sort_order || a.step_number - b.step_number)
    .map((s) => ({
      id: s.id,
      step_number: s.step_number,
      title: s.title,
      description: s.description,
      fields: [...(s.fields ?? [])]
        .filter((f) => f.is_visible !== false && (FIELD_TYPES as readonly string[]).includes(f.type))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(
          (f): FormFieldDef => ({
            id: f.id,
            key: f.key,
            label: f.label,
            type: f.type as FieldType,
            placeholder: f.placeholder,
            help_text: f.help_text,
            options: z.array(optionSchema).catch([]).parse(f.options),
            required: f.required,
            min: f.min === null ? null : Number(f.min),
            max: f.max === null ? null : Number(f.max),
            default_value: f.default_value,
            show_if: showIfSchema.parse(f.show_if ?? null),
            width: f.width === "half" ? "half" : "full",
            prefill_from: (f.prefill_from as PrefillSource | null) ?? null,
          }),
        ),
    }))
    .filter((s) => s.fields.length > 0);

  return {
    id: raw.id,
    slug: raw.slug,
    product_id: raw.product_id,
    title: raw.title,
    description: raw.description,
    submit_label: raw.submit_label,
    success_title: raw.success_title,
    success_message: raw.success_message,
    version: raw.version,
    steps,
  };
}

/* ---------------------------------------------------------- visibility --- */

function asComparable(value: FieldValue | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "boolean") return [String(value)];
  return value === undefined || value === "" ? [] : [value];
}

/** Whether a field is shown, given the current answers (show_if). */
export function isFieldVisible(field: FormFieldDef, values: FormValues): boolean {
  const rule = field.show_if;
  if (!rule) return true;
  const current = asComparable(values[rule.field]);
  if (rule.in) return current.some((v) => rule.in!.includes(v));
  if (rule.not_in) return !current.some((v) => rule.not_in!.includes(v));
  if (rule.equals !== undefined) return current.includes(String(rule.equals));
  return true;
}

export function visibleFields(step: FormStepDef, values: FormValues) {
  return step.fields.filter((f) => isFieldVisible(f, values));
}

/* ---------------------------------------------------------- validation --- */

const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,19}$/;

function isEmpty(field: FormFieldDef, value: FieldValue | undefined) {
  if (value === undefined || value === null) return true;
  if (field.type === "checkbox") return value !== true;
  if (field.type === "toggle") return false;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

/** Validate one field. Returns an error message, or null when it is fine. */
export function validateField(
  field: FormFieldDef,
  value: FieldValue | undefined,
  m: ValidationMessages = defaultMessages,
): string | null {
  if (isEmpty(field, value)) return field.required ? m.required : null;

  const optionValues = field.options.map((o) => o.value);
  switch (field.type) {
    case "checkbox":
    case "toggle":
      return typeof value === "boolean" ? null : m.required;
    case "checkbox_group": {
      if (!Array.isArray(value)) return m.invalidOption;
      if (value.some((v) => !optionValues.includes(v))) return m.invalidOption;
      if (field.min !== null && value.length < field.min) return m.chooseAtLeast(field.min);
      if (field.max !== null && value.length > field.max) return m.chooseAtMost(field.max);
      return null;
    }
    case "select":
    case "radio":
    case "radio_cards":
      return typeof value === "string" && optionValues.includes(value) ? null : m.invalidOption;
    case "number": {
      const n = Number(value);
      if (typeof value !== "string" || !Number.isFinite(n)) return m.number;
      if (field.min !== null && n < field.min) return m.tooSmall(field.min);
      if (field.max !== null && n > field.max) return m.tooLarge(field.max);
      return null;
    }
    default: {
      if (typeof value !== "string") return m.required;
      const text = value.trim();
      if (field.type === "email" && !z.email().safeParse(text).success) return m.email;
      if (field.type === "phone" && !PHONE_RE.test(text)) return m.phone;
      if (field.type === "url") {
        const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
        if (!z.url({ protocol: /^https?$/ }).safeParse(withScheme).success || !withScheme.includes(".")) return m.url;
      }
      if (field.min !== null && text.length < field.min) return m.tooShort(field.min);
      const max = field.max ?? (field.type === "textarea" ? 5000 : 500);
      if (text.length > max) return m.tooLong(max);
      return null;
    }
  }
}

/** Errors for the visible fields of one step, keyed by field key. */
export function validateStep(step: FormStepDef, values: FormValues, m?: ValidationMessages) {
  const errors: Record<string, string> = {};
  for (const field of visibleFields(step, values)) {
    const error = validateField(field, values[field.key], m);
    if (error) errors[field.key] = error;
  }
  return errors;
}

/** Validate the whole form. `values` keeps only visible fields, normalised. */
export function validateForm(form: FormDef, raw: FormValues, m?: ValidationMessages) {
  const errors: Record<string, string> = {};
  const values: FormValues = {};
  let firstInvalidStep = -1;
  form.steps.forEach((step, index) => {
    for (const field of visibleFields(step, raw)) {
      const value = normaliseValue(field, raw[field.key]);
      const error = validateField(field, value, m);
      if (error) {
        errors[field.key] = error;
        if (firstInvalidStep === -1) firstInvalidStep = index;
      } else if (!isEmpty(field, value) || field.type === "toggle") {
        values[field.key] = value as FieldValue;
      }
    }
  });
  return { ok: Object.keys(errors).length === 0, errors, values, firstInvalidStep };
}

function normaliseValue(field: FormFieldDef, value: FieldValue | undefined): FieldValue | undefined {
  if (value === undefined) return field.type === "toggle" ? false : undefined;
  if (field.type === "toggle" || field.type === "checkbox") return value === true || value === "true";
  if (field.type === "checkbox_group") return Array.isArray(value) ? value.map(String) : [];
  if (Array.isArray(value) || typeof value === "boolean") return value;
  const text = String(value).trim();
  if (field.type === "url" && text && !/^https?:\/\//i.test(text)) return `https://${text}`;
  if (field.type === "email") return text.toLowerCase();
  return text;
}

/* ------------------------------------------------------------- answers --- */

export function displayValue(
  field: FormFieldDef,
  value: FieldValue | undefined,
  labels: { yes: string; no: string } = { yes: "Yes", no: "No" },
): string {
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? labels.yes : labels.no;
  const label = (v: string) => field.options.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(label).join(", ");
  return field.options.length ? label(value) : value;
}

/** Readable answers stored on the order (survive later form changes). */
export function buildAnswers(form: FormDef, values: FormValues, labels?: { yes: string; no: string }): Answer[] {
  const answers: Answer[] = [];
  for (const step of form.steps) {
    for (const field of visibleFields(step, values)) {
      const value = values[field.key];
      if (value === undefined) continue;
      answers.push({
        key: field.key,
        label: stripMarkdown(field.label),
        value,
        display_value: displayValue(field, value, labels),
        step: step.title,
      });
    }
  }
  return answers;
}

/** "[Terms](/terms)" → "Terms" for stored labels. */
export function stripMarkdown(text: string) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
}

/* -------------------------------------------------------------- values --- */

export type PrefillData = {
  full_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  business_name?: string | null;
  email?: string | null;
};

function prefillValue(source: PrefillSource | null, data: PrefillData) {
  switch (source) {
    case "profile.full_name":
      return data.full_name;
    case "profile.phone":
      return data.phone;
    case "profile.whatsapp":
      return data.whatsapp;
    case "profile.business_name":
      return data.business_name;
    case "user.email":
      return data.email;
    default:
      return null;
  }
}

/** Starting values: defaults, then profile prefill. */
export function initialValues(form: FormDef, prefill: PrefillData = {}): FormValues {
  const values: FormValues = {};
  for (const step of form.steps) {
    for (const field of step.fields) {
      const fromProfile = prefillValue(field.prefill_from, prefill);
      if (field.type === "checkbox" || field.type === "toggle") {
        values[field.key] = field.default_value === "true";
      } else if (field.type === "checkbox_group") {
        values[field.key] = field.default_value
          ? field.default_value.split(",").map((v) => v.trim()).filter(Boolean)
          : [];
      } else {
        values[field.key] = fromProfile ?? field.default_value ?? "";
      }
    }
  }
  return values;
}

/** Keep only keys/types that belong to the form (used when restoring drafts). */
export function sanitizeValues(form: FormDef, input: unknown): FormValues {
  const out: FormValues = {};
  if (!input || typeof input !== "object") return out;
  const record = input as Record<string, unknown>;
  for (const step of form.steps) {
    for (const field of step.fields) {
      const v = record[field.key];
      if (field.type === "checkbox" || field.type === "toggle") {
        if (typeof v === "boolean") out[field.key] = v;
      } else if (field.type === "checkbox_group") {
        if (Array.isArray(v)) out[field.key] = v.filter((x): x is string => typeof x === "string");
      } else if (typeof v === "string") {
        out[field.key] = v.slice(0, 5000);
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------- zod schema --- */

/**
 * Zod schema for a set of fields, built from their database definitions
 * (type, required, min, max, options). Pass only the visible fields: hidden
 * fields (show_if) are neither validated nor submitted.
 */
export function buildSchema(fields: FormFieldDef[], m: ValidationMessages = defaultMessages) {
  const shape: Record<string, z.ZodType<FieldValue | undefined>> = {};
  for (const field of fields) {
    shape[field.key] = z.custom<FieldValue | undefined>().superRefine((value, ctx) => {
      const error = validateField(field, value, m);
      if (error) ctx.addIssue({ code: "custom", message: error });
    });
  }
  return z.object(shape);
}
