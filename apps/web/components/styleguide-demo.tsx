"use client";

import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  CheckboxGroup,
  Dialog,
  DropdownMenu,
  EmptyState,
  Field,
  Input,
  ProductChip,
  RadioCards,
  Select,
  Skeleton,
  StatusBadge,
  Stepper,
  Switch,
  Tabs,
  Textarea,
  ThemeToggle,
} from "@retexia/ui";
import { Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const options = [
  { value: "a", label: "We sell products", description: "Clothes, food, electronics" },
  { value: "b", label: "We offer services", description: "Appointments, classes" },
  { value: "c", label: "Both" },
];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <h2 className="type-eyebrow text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

export function StyleguideDemo({ productSlugs }: { productSlugs: string[] }) {
  const [radio, setRadio] = useState("a");
  const [checks, setChecks] = useState<string[]>(["a"]);
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState("one");
  const [dialog, setDialog] = useState(false);
  const [step, setStep] = useState(1);
  const swatches = ["surface", "surface-raised", "surface-sunk", "line", "line-strong", "ink", "ink-muted", "brand", "brand-hover", "brand-soft", "brand-halo", "success", "success-soft", "warning", "warning-soft", "danger", "danger-soft"];

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-center justify-between">
        <h1 className="type-display text-ink">Styleguide</h1>
        <ThemeToggle />
      </div>

      <Row title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {swatches.map((s) => (
            <div key={s} className="flex flex-col gap-1">
              <div className="h-12 rounded-md border border-line" style={{ background: `var(--rx-${s})` }} />
              <span className="type-code text-ink-muted">{s}</span>
            </div>
          ))}
          {productSlugs.map((slug) => (
            <div key={slug} className="flex flex-col gap-1">
              <div className="h-12 rounded-md border border-line" style={{ background: `var(--product-${slug})` }} />
              <span className="type-code text-ink-muted">product-{slug}</span>
            </div>
          ))}
        </div>
      </Row>

      <Row title="Type">
        <p className="type-eyebrow text-brand">Simple tools for busy businesses</p>
        <p className="type-display-xl">Less noise. More <span className="text-brand">clarity.</span></p>
        <p className="type-display">Display 36/44</p>
        <p className="type-h1">Heading 1 26/34</p>
        <p className="type-h2">Heading 2 18/26</p>
        <p className="type-h3">Heading 3 14/20</p>
        <p className="type-body-lg text-ink-muted">Body large 16/26 for intros under headlines.</p>
        <p className="type-body">Body 14/22, the default.</p>
        <p className="type-label">Label 13/20</p>
        <p className="type-small text-ink-muted">Small 12/18 for hints</p>
        <p className="type-caption">Caption 11/16</p>
        <p className="type-code">LNG-2026-0001 · +94 77 123 4567</p>
      </Row>

      <Row title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Loading</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button href="/contact" variant="secondary">As link</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" onClick={() => toast.success("Saved. Toasts use the design system.")}>Toast</Button>
        </div>
      </Row>

      <Row title="Badges and chips">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Neutral</Badge>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <StatusBadge tone="brand" label="Submitted" />
          <StatusBadge tone="success" label="Active" />
          {productSlugs.map((slug) => (
            <ProductChip key={slug} slug={slug} name={slug} />
          ))}
          <Avatar name="Amaya Silva" />
        </div>
      </Row>

      <Row title="Form controls">
        <Card className="grid gap-6 sm:grid-cols-2">
          <Field label="Business name" required hint="As customers know it.">
            <Input placeholder="Nimali Fashion" />
          </Field>
          <Field label="City" required error="Please fill this in">
            <Input />
          </Field>
          <Field label="Industry" optionalLabel="Optional">
            <Select options={[{ value: "x", label: "Clothing and fashion" }]} />
          </Field>
          <Field label="Notes" optionalLabel="Optional" className="sm:col-span-2">
            <Textarea placeholder="Anything else?" />
          </Field>
          <Field label="What does your business do?" labelAs="legend" required className="sm:col-span-2">
            <RadioCards name="demo-radio" options={options} value={radio} onChange={setRadio} />
          </Field>
          <Field label="Languages" labelAs="legend" required className="sm:col-span-2">
            <CheckboxGroup name="demo-checks" options={options} value={checks} onChange={setChecks} />
          </Field>
          <Switch checked={on} onCheckedChange={setOn} label="Takes bookings" description="Switch with label" />
          <Checkbox label="I agree to the terms" />
        </Card>
      </Row>

      <Row title="Tabs, stepper, menu, dialog">
        <Tabs
          idPrefix="demo"
          label="Demo tabs"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "one", label: "All", count: 3 },
            { value: "two", label: "Active", count: 1 },
            { value: "three", label: "Closed", count: 0 },
          ]}
        />
        <Stepper steps={[{ title: "About your business" }, { title: "What to talk about" }, { title: "WhatsApp" }]} current={step} onStepClick={setStep} />
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setStep((s) => Math.min(3, s + 1))}>Next step</Button>
          <DropdownMenu
            trigger={<span className="inline-flex h-10 items-center rounded-full border border-line px-4 type-label">Menu</span>}
            items={[{ href: "/account", label: "Account" }, { type: "separator" }, { type: "button", label: "Sign out", onSelect: () => toast("Signed out") }]}
            align="start"
          />
          <Button onClick={() => setDialog(true)}>Open dialog</Button>
        </div>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title="Cancel this request?"
          description="Request LNG-2026-0001 will be closed."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>Keep</Button>
              <Button variant="danger" onClick={() => setDialog(false)}>Yes, cancel it</Button>
            </>
          }
        />
      </Row>

      <Row title="Feedback">
        <Alert tone="info" title="Complete your profile">Add your phone number.</Alert>
        <Alert tone="success">Your password was updated.</Alert>
        <Alert tone="warning" title="Awaiting payment">Pay to start setup.</Alert>
        <Alert tone="danger">That email or password doesn&apos;t match.</Alert>
        <Card padded={false}>
          <EmptyState icon={<Package aria-hidden size={24} strokeWidth={1.5} />} title="You have no products yet" actions={<Button>Browse products</Button>}>
            Pick a tool and we will set it up for you.
          </EmptyState>
        </Card>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Accordion items={[{ id: "1", title: "Do I need technical skills?", content: <p className="type-body text-ink-muted">No. We set everything up.</p> }]} />
      </Row>
    </div>
  );
}
