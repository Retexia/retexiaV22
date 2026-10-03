"use client";

import { Alert, Button, Card, Stepper } from "@retexia/ui";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { displayValue, initialValues, stripMarkdown, visibleFields, type FormDef, type FormValues } from "./engine";
import { FormStepFields, validateFormStep } from "./form-steps";
import { validationMessages } from "./messages";
import { fallbackT, type Translate } from "./translate";

/**
 * The customer form exactly as retexia.com shows it (same fields, same
 * validation, same conditional logic), without submitting. Used by the admin
 * form builder and the "new request" screen.
 */
export function FormPreview({
  form,
  t = fallbackT,
  note,
  onComplete,
  completeLabel,
  initial,
}: {
  form: FormDef;
  t?: Translate;
  /** Shown above the form, e.g. "Preview: nothing is saved". */
  note?: string;
  /** When set, the review screen gets a button that hands back the answers. */
  onComplete?: (values: FormValues) => void | Promise<void>;
  completeLabel?: string;
  initial?: FormValues;
}) {
  const messages = useMemo(() => validationMessages(t), [t]);
  const [step, setStep] = useState<number | "review">(0);
  const [pending, setPending] = useState(false);
  const methods = useForm<FormValues>({ defaultValues: initial ?? initialValues(form) });
  const { control, getValues, setError, clearErrors, formState } = methods;
  const values = useWatch({ control }) as FormValues;
  const current = step === "review" ? null : form.steps[step];

  if (!form.steps.length) {
    return <Alert tone="info">This form has no visible fields yet.</Alert>;
  }

  const next = () => {
    if (step === "review") return;
    if (!validateFormStep(form.steps[step], getValues(), messages, setError, clearErrors)) return;
    setStep(step + 1 >= form.steps.length ? "review" : step + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      {note ? <Alert tone="info">{note}</Alert> : null}
      <Stepper
        steps={form.steps.map((s) => ({ title: s.title }))}
        current={step === "review" ? form.steps.length : step}
        onStepClick={(i) => setStep(i)}
        label={t("onboarding.progress", "Form progress")}
        stepLabel={(n, total) =>
          step === "review" ? t("onboarding.review_step", "Review and submit") : t("onboarding.step_of", "Step {n} of {total}", { n, total })
        }
      />
      {current ? (
        <form
          noValidate
          method="post"
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
          className="flex flex-col gap-8"
        >
          <div className="flex flex-col gap-1">
            <h3 className="type-h1 text-ink">{current.title}</h3>
            {current.description ? <p className="type-body-lg text-ink-muted">{current.description}</p> : null}
          </div>
          <FormStepFields step={current} values={values} control={control} errors={formState.errors} clearErrors={clearErrors} t={t} />
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-between">
            {step !== 0 ? (
              <Button variant="ghost" onClick={() => setStep((step as number) - 1)} icon={<ArrowLeft aria-hidden size={16} strokeWidth={1.5} />}>
                {t("form.back", "Back")}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" iconAfter={<ArrowRight aria-hidden size={16} strokeWidth={1.5} />}>
              {step === form.steps.length - 1 ? t("form.review", "Review answers") : t("form.next", "Next")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          {form.steps.map((s, i) => (
            <Card key={s.id} className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="type-h2 text-ink">{s.title}</h3>
                <Button variant="ghost" size="sm" onClick={() => setStep(i)} icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />}>
                  {t("form.edit", "Edit")}
                </Button>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                {visibleFields(s, values).map((f) => (
                  <div key={f.id} className={f.type === "textarea" || f.type === "checkbox" ? "sm:col-span-2" : undefined}>
                    <dt className="type-small text-ink-muted">{stripMarkdown(f.label)}</dt>
                    <dd className="type-body break-words whitespace-pre-line text-ink">
                      {displayValue(f, values[f.key], { yes: t("common.yes", "Yes"), no: t("common.no", "No") }) || (
                        <span className="text-ink-muted">{t("onboarding.not_answered", "Not answered")}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={() => setStep(form.steps.length - 1)} icon={<ArrowLeft aria-hidden size={16} strokeWidth={1.5} />}>
              {t("form.back", "Back")}
            </Button>
            {onComplete ? (
              <Button
                loading={pending}
                onClick={async () => {
                  setPending(true);
                  try {
                    await onComplete(getValues());
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {completeLabel ?? form.submit_label ?? t("onboarding.submit", "Submit request")}
              </Button>
            ) : (
              <Button disabled>{form.submit_label ?? t("onboarding.submit", "Submit request")}</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
