"use client";

import { Field, Select } from "@retexia/ui";
import { createContext, useContext, type ReactNode } from "react";
import { focusOptions, type FocusChoices } from "@/lib/post/focus";

const FocusContext = createContext<FocusChoices>({ products: [], groups: [] });

/** The business's products and groups, for every "About" drop-down in the panel. */
export function FocusProvider({ choices, children }: { choices: FocusChoices; children: ReactNode }) {
  return <FocusContext.Provider value={choices}>{children}</FocusContext.Provider>;
}

/** "What is it about?": the whole business, a group, or one product. */
export function FocusSelect({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) {
  const choices = useContext(FocusContext);
  const options = focusOptions(choices);
  // A product or group deleted since: show it as the whole business.
  const current = options.some((o) => o.value === value) ? value : "business";
  return (
    <Field
      label="About"
      hint={
        hint ??
        (choices.products.length
          ? "One product, a group of products, or your business as a whole (from “About your business” on the Brand page)."
          : "Add products (and groups) on the Products page to make posts about them.")
      }
    >
      <Select value={current} onChange={(e) => onChange(e.target.value || "business")} options={options} />
    </Field>
  );
}
