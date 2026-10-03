"use client";

import { Alert, Button, Card, Field, Input, RadioCards, Select, Stepper, Textarea, Switch } from "@retexia/ui";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createProduct } from "@/app/(panel)/products/actions";
import { ColorPair, colorWarnings, type ProductColors } from "./color-pair";
import { IconPicker } from "./icon-picker";
import { PackageEditor, emptyPackage, packagePayload, slugify, type PackageDraft } from "./package-editor";

type OtherProduct = { id: string; name: string; code: string; slug: string; color_light: string };

const STEPS = [{ title: "Basics" }, { title: "Colour" }, { title: "Packages" }, { title: "Page and form" }, { title: "Review" }];

/** Three letters for request refs (LIN-2026-0001), unique among products. */
function suggestCode(name: string, taken: string[]) {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  const candidates = [letters.slice(0, 3), letters[0] + letters.slice(2, 4), letters[0] + (letters.match(/[^AEIOU]/g) ?? []).slice(1, 3).join("")];
  for (const c of candidates) if (c.length === 3 && !taken.includes(c)) return c;
  for (let i = 0; i < 26; i++) {
    const c = (letters.slice(0, 2) + String.fromCharCode(65 + i)).padEnd(3, "X");
    if (!taken.includes(c)) return c;
  }
  return "";
}

export function ProductWizard({ others, currency }: { others: OtherProduct[]; currency: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [basics, setBasics] = useState({ name: "", short_name: "", slug: "", code: "", icon: "sparkles", tagline: "", description: "" });
  const [touched, setTouched] = useState({ short_name: false, slug: false, code: false });
  const [colors, setColors] = useState<ProductColors>({ color_light: "#7a3fb8", color_dark: "#c4a1ef", color_soft_light: "#f3ecfb", color_soft_dark: "#251838" });
  const [hasPackages, setHasPackages] = useState(true);
  const [packages, setPackages] = useState<PackageDraft[]>([emptyPackage()]);
  const [openPkg, setOpenPkg] = useState(0);
  const [form, setForm] = useState<{ mode: "blank" | "clone"; from_product_id: string }>({ mode: "blank", from_product_id: "" });

  const takenCodes = others.map((o) => o.code);
  const setName = (name: string) => {
    // "Retexia Lingo" → short name "Lingo", slug "lingo", code "LIN".
    const words = name.trim().split(/\s+/);
    const core = words.length > 1 && /^retexia$/i.test(words[0] ?? "") ? words.slice(1).join(" ") : name.trim();
    setBasics((b) => ({
      ...b,
      name,
      short_name: touched.short_name ? b.short_name : core,
      slug: touched.slug ? b.slug : slugify(core),
      code: touched.code ? b.code : suggestCode(core, takenCodes),
    }));
  };

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (basics.name.trim().length < 2) e.name = "Enter the product name.";
      if (!basics.short_name.trim()) e.short_name = "Enter a short name.";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(basics.slug)) e.slug = "Lowercase letters, numbers and dashes.";
      else if (others.some((o) => o.slug === basics.slug)) e.slug = "Another product uses this address.";
      if (!/^[A-Z]{3}$/.test(basics.code)) e.code = "Three capital letters.";
      else if (takenCodes.includes(basics.code)) e.code = "Another product uses this code.";
    }
    if (s === 2 && hasPackages) {
      packages.forEach((p, i) => {
        if (!p.name.trim()) e[`pkg${i}`] = `Package ${i + 1} needs a name.`;
        else if (p.price_monthly === "") e[`pkg${i}`] = `${p.name} needs a monthly price.`;
      });
      const slugs = packages.map((p) => packagePayload(p).slug);
      if (new Set(slugs).size !== slugs.length) e.packages = "Two packages have the same slug.";
    }
    if (s === 3 && form.mode === "clone" && !form.from_product_id) e.form = "Choose which product's form to copy.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    for (const s of [0, 2, 3]) if (!validate(s)) return setStep(s);
    setBusy(true);
    const r = await createProduct({
      ...basics,
      ...colors,
      packages: hasPackages ? packages.map(packagePayload) : [],
      form: form.mode === "clone" ? { mode: "clone", from_product_id: form.from_product_id } : { mode: "blank" },
    });
    setBusy(false);
    if (!r.ok) {
      toast.error(r.message);
      if (r.fieldErrors) setErrors(r.fieldErrors);
      return;
    }
    toast.success(r.message ?? "Product created");
    router.push(`/products/${r.data}`);
  };

  const warnings = colorWarnings(colors, others.map((o) => ({ name: o.name, color_light: o.color_light })));

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={STEPS} current={step} onStepClick={(i) => i < step && setStep(i)} />

      <Card className="flex flex-col gap-6">
        {step === 0 ? (
          <>
            <h2 className="type-h2 text-ink">Basics</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name" error={errors.name} required className="sm:col-span-2">
                <Input value={basics.name} onChange={(e) => setName(e.target.value)} placeholder="Retexia Lingo" autoFocus />
              </Field>
              <Field label="Short name" hint="Used in menus and chips." error={errors.short_name} required>
                <Input
                  value={basics.short_name}
                  onChange={(e) => {
                    setTouched((t) => ({ ...t, short_name: true }));
                    setBasics({ ...basics, short_name: e.target.value });
                  }}
                />
              </Field>
              <Field label="Web address" hint={`retexia.com/${basics.slug || "slug"}`} error={errors.slug} required>
                <Input
                  value={basics.slug}
                  onChange={(e) => {
                    setTouched((t) => ({ ...t, slug: true }));
                    setBasics({ ...basics, slug: slugify(e.target.value) });
                  }}
                />
              </Field>
              <Field label="Request code" hint={`Request refs look like ${basics.code || "ABC"}-${new Date().getFullYear()}-0001.`} error={errors.code} required>
                <Input
                  value={basics.code}
                  maxLength={3}
                  onChange={(e) => {
                    setTouched((t) => ({ ...t, code: true }));
                    setBasics({ ...basics, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") });
                  }}
                />
              </Field>
              <IconPicker value={basics.icon} onChange={(icon) => setBasics({ ...basics, icon })} />
              <Field label="Tagline" hint="One line under the name." optionalLabel="Optional" className="sm:col-span-2">
                <Input value={basics.tagline} onChange={(e) => setBasics({ ...basics, tagline: e.target.value })} />
              </Field>
              <Field label="Description" optionalLabel="Optional" className="sm:col-span-2">
                <Textarea rows={3} value={basics.description} onChange={(e) => setBasics({ ...basics, description: e.target.value })} />
              </Field>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="type-h2 text-ink">Colour</h2>
              <p className="type-body text-ink-muted">Each product has its own accent. Pick one that is clearly different from the brand blue and the other products.</p>
            </div>
            <ColorPair value={colors} onChange={setColors} name={basics.short_name} others={others.map((o) => ({ name: o.name, color_light: o.color_light }))} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="type-h2 text-ink">Packages</h2>
                <p className="type-body text-ink-muted">What customers can choose. You can change these any time.</p>
              </div>
              <Switch checked={!hasPackages} onCheckedChange={(v) => setHasPackages(!v)} label="No packages yet (waitlist only)" />
            </div>
            {errors.packages ? <Alert tone="danger">{errors.packages}</Alert> : null}
            {hasPackages ? (
              <>
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Packages">
                  {packages.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={openPkg === i}
                      onClick={() => setOpenPkg(i)}
                      className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 type-label ${openPkg === i ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-muted hover:text-ink"} ${errors[`pkg${i}`] ? "border-danger!" : ""}`}
                    >
                      {p.name || `Package ${i + 1}`}
                    </button>
                  ))}
                  {packages.length < 6 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Plus aria-hidden size={14} strokeWidth={1.5} />}
                      onClick={() => {
                        setPackages([...packages, emptyPackage()]);
                        setOpenPkg(packages.length);
                      }}
                    >
                      Add package
                    </Button>
                  ) : null}
                </div>
                {Object.entries(errors)
                  .filter(([k]) => k.startsWith("pkg"))
                  .map(([k, v]) => (
                    <Alert key={k} tone="danger">
                      {v}
                    </Alert>
                  ))}
                {packages[openPkg] ? (
                  <div className="flex flex-col gap-4">
                    <PackageEditor value={packages[openPkg]} currency={currency} onChange={(p) => setPackages(packages.map((x, i) => (i === openPkg ? p : x)))} />
                    {packages.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="self-start text-danger!"
                        icon={<Trash2 aria-hidden size={14} strokeWidth={1.5} />}
                        onClick={() => {
                          setPackages(packages.filter((_, i) => i !== openPkg));
                          setOpenPkg(0);
                        }}
                      >
                        Remove this package
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <Alert tone="info">The product page will show a waitlist instead of pricing. Add packages later from the product’s Packages tab.</Alert>
            )}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="type-h2 text-ink">Page and onboarding form</h2>
              <p className="type-body text-ink-muted">
                We create a product page at /{basics.slug} with a hero, features, how it works, {hasPackages ? "pricing" : "a waitlist"}, FAQs and a call to action. Edit every section afterwards.
              </p>
            </div>
            <Field label="Onboarding form" labelAs="legend" error={errors.form}>
              <RadioCards
                name="form-mode"
                value={form.mode}
                onChange={(v) => setForm({ ...form, mode: v as "blank" | "clone" })}
                columns={2}
                options={[
                  { value: "blank", label: "Start simple", description: "Three steps: business, contact details, review." },
                  { value: "clone", label: "Copy another product's form", description: "All steps and questions, ready to adjust." },
                ]}
              />
            </Field>
            {form.mode === "clone" ? (
              <Field label="Copy from" required>
                <Select value={form.from_product_id} onChange={(e) => setForm({ ...form, from_product_id: e.target.value })} options={others.map((o) => ({ value: o.id, label: o.name }))} />
              </Field>
            ) : null}
            <Alert tone="info">Service fields (what your team fills in during setup) are copied from the same product when you copy its form.</Alert>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <h2 className="type-h2 text-ink">Review</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Name", `${basics.name} (${basics.short_name})`],
                ["Web address", `retexia.com/${basics.slug}`],
                ["Request code", basics.code],
                ["Icon", basics.icon],
                ["Packages", hasPackages ? packages.map((p) => p.name).join(", ") : "None yet (waitlist)"],
                ["Onboarding form", form.mode === "clone" ? `Copy of ${others.find((o) => o.id === form.from_product_id)?.name ?? "—"}` : "Simple three-step form"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <dt className="type-small text-ink-muted">{k}</dt>
                  <dd className="type-body text-ink">{v}</dd>
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <dt className="type-small text-ink-muted">Colour</dt>
                <dd className="flex items-center gap-2">
                  {[colors.color_light, colors.color_soft_light, colors.color_dark, colors.color_soft_dark].map((c) => (
                    <span key={c} className="size-6 rounded-full border border-line" style={{ background: c }} title={c} />
                  ))}
                </dd>
              </div>
            </dl>
            {warnings.length ? (
              <Alert tone="warning" title="Colour check">
                {warnings.join(" ")}
              </Alert>
            ) : null}
            <Alert tone="info">The product starts hidden. Nothing appears on the website until you set it to live or coming soon.</Alert>
          </>
        ) : null}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" icon={<ArrowLeft aria-hidden size={16} strokeWidth={1.5} />} onClick={() => (step === 0 ? router.push("/products") : setStep(step - 1))}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next} iconAfter={<ArrowRight aria-hidden size={16} strokeWidth={1.5} />}>
            Continue
          </Button>
        ) : (
          <Button onClick={submit} loading={busy}>
            Create product
          </Button>
        )}
      </div>
    </div>
  );
}
