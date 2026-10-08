"use client";

import { Alert, Button, Card, Dialog, ProductChip, RadioCards, Skeleton, Stepper, Switch, useMounted } from "@retexia/ui";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  displayValue,
  sanitizeValues,
  stripMarkdown,
  visibleFields,
  type FormDef,
  type FormValues,
  validationMessages,
} from "@retexia/forms";
import { FormStepFields, validateFormStep } from "@retexia/forms/react";
import { submitOrder } from "@/app/(site)/[slug]/get-started/actions";
import { useT } from "@/lib/strings-context";

export type OnboardingPackage = {
  slug: string;
  name: string;
  tagline: string | null;
  monthly: string;
  yearly: string | null;
  setupFee: string | null;
};

type Props = {
  userId: string;
  product: { slug: string; pageSlug: string; name: string; shortName: string };
  packages: OnboardingPackage[];
  initialPackage: string;
  initialCycle: "monthly" | "yearly";
  form: FormDef;
  initial: FormValues;
};

type Draft = { v: 1; formVersion: number; values: FormValues; step: number | "review"; savedAt: number };

const draftKey = (userId: string, productSlug: string) => `retexia:onboarding:${userId}:${productSlug}`;

function readDraft(key: string, form: FormDef): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (draft?.v !== 1 || draft.formVersion !== form.version) return null;
    return { ...draft, values: sanitizeValues(form, draft.values) };
  } catch {
    return null;
  }
}

/** Client-only wrapper: drafts live in localStorage, so render after mount. */
export function OnboardingFlow(props: Props) {
  const mounted = useMounted();
  if (!mounted) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <OnboardingForm {...props} />;
}

function OnboardingForm({ userId, product, packages, initialPackage, initialCycle, form, initial }: Props) {
  const t = useT();
  const router = useRouter();
  const messages = useMemo(() => validationMessages(t), [t]);
  const key = draftKey(userId, product.slug);

  const [restored] = useState(() => readDraft(key, form));
  const [step, setStep] = useState<number | "review">(() =>
    restored ? (restored.step === "review" ? "review" : Math.min(restored.step, form.steps.length - 1)) : 0,
  );
  const [packageSlug, setPackageSlug] = useState(initialPackage);
  const [cycle, setCycle] = useState<"monthly" | "yearly">(initialCycle);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [showRestored, setShowRestored] = useState(Boolean(restored));
  const headingRef = useRef<HTMLHeadingElement>(null);

  const methods = useForm<FormValues>({ defaultValues: { ...initial, ...(restored?.values ?? {}) } });
  const { control, getValues, setError, clearErrors, reset, formState } = methods;
  const values = useWatch({ control }) as FormValues;

  const pkg = packages.find((p) => p.slug === packageSlug) ?? packages[0];

  // Autosave the draft (values + step) on every change.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const draft: Draft = { v: 1, formVersion: form.version, values: getValues(), step, savedAt: Date.now() };
        window.localStorage.setItem(key, JSON.stringify(draft));
      } catch {
        // Storage full or blocked: the form still works, just without drafts.
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [values, step, key, form.version, getValues]);

  // Keep ?package and ?cycle in the URL so a refresh keeps the choice.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("package", packageSlug);
    url.searchParams.set("cycle", cycle);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [packageSlug, cycle]);

  const goTo = (next: number | "review") => {
    setStep(next);
    requestAnimationFrame(() => {
      headingRef.current?.focus();
      headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const validateCurrent = (index: number) =>
    validateFormStep(form.steps[index], getValues(), messages, setError, clearErrors);

  const onNext = () => {
    if (step === "review") return;
    if (!validateCurrent(step)) return;
    goTo(step + 1 >= form.steps.length ? "review" : step + 1);
  };

  const onBack = () => {
    if (step === "review") goTo(form.steps.length - 1);
    else if (step > 0) goTo(step - 1);
  };

  const startOver = () => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    reset(initial);
    setShowRestored(false);
    goTo(0);
  };

  const onSubmit = async () => {
    if (pending || !pkg) return;
    for (let i = 0; i < form.steps.length; i++) {
      if (!validateCurrent(i)) {
        goTo(i);
        return;
      }
    }
    setPending(true);
    const result = await submitOrder({
      pageSlug: product.pageSlug,
      packageSlug: pkg.slug,
      cycle,
      values: getValues(),
    });
    if (result.ok) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
      router.push(`/account/products/${encodeURIComponent(result.ref)}?new=1&pay=1`);
      return;
    }
    setPending(false);
    toast.error(result.message);
    if (result.errors) {
      for (const [name, message] of Object.entries(result.errors)) setError(name, { type: "server", message });
      if (typeof result.step === "number" && result.step >= 0) goTo(result.step);
    }
  };

  const price = pkg ? (cycle === "yearly" && pkg.yearly ? pkg.yearly : pkg.monthly) : "";
  const perLabel = cycle === "yearly" && pkg?.yearly ? t("pricing.per_year", "/ year") : t("pricing.per_month", "/ month");
  const currentStep = step === "review" ? null : form.steps[step];

  return (
    <div className="grid gap-8 lg:grid-cols-[300px_1fr] lg:gap-12">
      {/* Package summary */}
      <aside aria-label={t("onboarding.summary", "Your package")} className="lg:sticky lg:top-24 lg:self-start">
        <Card className="flex flex-col gap-4">
          <ProductChip slug={product.slug} name={product.shortName} size="sm" className="self-start" />
          <div className="flex flex-col gap-1">
            <p className="type-h2 text-ink">{pkg?.name}</p>
            {pkg?.tagline ? <p className="type-body text-ink-muted">{pkg.tagline}</p> : null}
          </div>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[26px] leading-[34px] font-light text-ink">{price}</span>
            <span className="type-body text-ink-muted">{perLabel}</span>
          </p>
          <p className="type-small text-ink-muted">
            {pkg?.setupFee
              ? t("pricing.setup_fee", "+ {amount} one-time setup", { amount: pkg.setupFee })
              : t("pricing.no_setup_fee", "No setup fee")}
          </p>
          <p className="type-small text-ink-muted">
            {cycle === "yearly" ? t("onboarding.billed_yearly", "Billed yearly") : t("onboarding.billed_monthly", "Billed monthly")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)} className="self-start">
            {t("onboarding.change_package", "Change package")}
          </Button>
          <p className="border-t border-line pt-4 type-small text-ink-muted">
            {t("onboarding.pay_next", "Next: pay securely with Paddle (card, Apple Pay, Google Pay or PayPal). We start as soon as the payment goes through.")}
          </p>
        </Card>
      </aside>

      {/* Form */}
      <div className="flex min-w-0 flex-col gap-8">
        {showRestored ? (
          <Alert
            tone="info"
            title={t("onboarding.restored_title", "Welcome back")}
            action={
              <Button variant="ghost" size="sm" onClick={startOver}>
                {t("onboarding.start_over", "Start over")}
              </Button>
            }
          >
            {t("onboarding.restored_text", "We restored the answers you saved on this device.")}
          </Alert>
        ) : null}

        <Stepper
          steps={form.steps.map((s) => ({ title: s.title }))}
          current={step === "review" ? form.steps.length : step}
          onStepClick={(i) => goTo(i)}
          label={t("onboarding.progress", "Form progress")}
          stepLabel={(n, total) =>
            step === "review"
              ? t("onboarding.review_step", "Review and submit")
              : t("onboarding.step_of", "Step {n} of {total}", { n, total })
          }
        />

        {currentStep ? (
          <form
            method="post"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              onNext();
            }}
            className="flex flex-col gap-8"
          >
            <div className="flex flex-col gap-1">
              <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-28 type-h1 text-ink outline-none">
                {currentStep.title}
              </h2>
              {currentStep.description ? <p className="type-body-lg text-ink-muted">{currentStep.description}</p> : null}
            </div>
            <FormStepFields
              step={currentStep}
              values={values}
              control={control}
              errors={formState.errors}
              clearErrors={clearErrors}
              t={t}
            />
            <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-between">
              {step !== 0 ? (
                <Button variant="ghost" onClick={onBack} icon={<ArrowLeft aria-hidden size={16} strokeWidth={1.5} />}>
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
          <section aria-labelledby="review-title" className="flex flex-col gap-8">
            <div className="flex flex-col gap-1">
              <h2 id="review-title" ref={headingRef} tabIndex={-1} className="scroll-mt-28 type-h1 text-ink outline-none">
                {t("onboarding.review_title", "Check your answers")}
              </h2>
              <p className="type-body-lg text-ink-muted">
                {t("onboarding.review_text", "Make sure everything is right, then send your request.")}
              </p>
            </div>

            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <p className="type-small text-ink-muted">{t("onboarding.selected_package", "Selected package")}</p>
                <p className="type-h2 text-ink">{pkg?.name}</p>
                <p className="type-body text-ink-muted">
                  {price} {perLabel}
                  {pkg?.setupFee ? ` · ${t("pricing.setup_fee", "+ {amount} one-time setup", { amount: pkg.setupFee })}` : ""}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
                {t("onboarding.change_package", "Change package")}
              </Button>
            </Card>

            {form.steps.map((s, i) => {
              const fields = visibleFields(s, values);
              return (
                <Card key={s.id} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="type-h2 text-ink">{s.title}</h3>
                    <Button variant="ghost" size="sm" onClick={() => goTo(i)} icon={<Pencil aria-hidden size={14} strokeWidth={1.5} />}>
                      {t("form.edit", "Edit")}
                      <span className="sr-only">: {s.title}</span>
                    </Button>
                  </div>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {fields.map((f) => {
                      const shown = displayValue(f, values[f.key], { yes: t("common.yes", "Yes"), no: t("common.no", "No") });
                      return (
                        <div key={f.id} className={f.type === "textarea" || f.type === "checkbox" ? "sm:col-span-2" : undefined}>
                          <dt className="type-small text-ink-muted">{stripMarkdown(f.label)}</dt>
                          <dd className="type-body break-words whitespace-pre-line text-ink">
                            {shown || <span className="text-ink-muted">{t("onboarding.not_answered", "Not answered")}</span>}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </Card>
              );
            })}

            <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={onBack} icon={<ArrowLeft aria-hidden size={16} strokeWidth={1.5} />}>
                {t("form.back", "Back")}
              </Button>
              <Button size="lg" onClick={onSubmit} loading={pending}>
                {form.submit_label ?? t("onboarding.submit", "Submit request")}
              </Button>
            </div>
          </section>
        )}
      </div>

      <PackageDialog
        key={dialogOpen ? `open-${packageSlug}-${cycle}` : "closed"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        packages={packages}
        packageSlug={packageSlug}
        cycle={cycle}
        onConfirm={(slug, c) => {
          setPackageSlug(slug);
          setCycle(c);
          setDialogOpen(false);
          toast.success(t("onboarding.package_changed", "Package updated"));
        }}
      />
    </div>
  );
}

function PackageDialog({
  open,
  onOpenChange,
  packages,
  packageSlug,
  cycle,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packages: OnboardingPackage[];
  packageSlug: string;
  cycle: "monthly" | "yearly";
  onConfirm: (slug: string, cycle: "monthly" | "yearly") => void;
}) {
  const t = useT();
  const [slug, setSlug] = useState(packageSlug);
  const [yearly, setYearly] = useState(cycle === "yearly");
  const selected = packages.find((p) => p.slug === slug);
  const yearlyAvailable = Boolean(selected?.yearly);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("onboarding.change_package", "Change package")}
      description={t("onboarding.change_package_text", "Your answers stay as they are.")}
      closeLabel={t("common.close", "Close")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={() => onConfirm(slug, yearly && yearlyAvailable ? "yearly" : "monthly")}>
            {t("onboarding.use_package", "Use this package")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <RadioCards
          name="package"
          columns={1}
          value={slug}
          onChange={setSlug}
          options={packages.map((p) => ({
            value: p.slug,
            label: p.name,
            description: `${yearly && p.yearly ? p.yearly : p.monthly} ${
              yearly && p.yearly ? t("pricing.per_year", "/ year") : t("pricing.per_month", "/ month")
            }${p.tagline ? ` · ${p.tagline}` : ""}`,
          }))}
        />
        <Switch
          checked={yearly && yearlyAvailable}
          disabled={!yearlyAvailable}
          onCheckedChange={setYearly}
          label={t("onboarding.pay_yearly", "Pay yearly")}
          description={
            yearlyAvailable
              ? t("pricing.yearly_badge", "2 months free")
              : t("pricing.monthly_only", "Monthly billing only")
          }
        />
      </div>
    </Dialog>
  );
}
