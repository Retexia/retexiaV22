"use client";

import { Alert } from "@retexia/ui";
import { ColorField } from "@retexia/ui/admin";
import { SURFACE_DARK, SURFACE_LIGHT, colorWarnings, type ProductColors } from "./color-check";

export { colorWarnings, type ProductColors };

function Preview({ fg, bg, surface, name, dark }: { fg: string; bg: string; surface: string; name: string; dark?: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-md p-4" style={{ background: surface }}>
      <span className="type-small" style={{ color: dark ? "#9daac3" : "#5a6884" }}>
        {dark ? "Dark mode" : "Light mode"}
      </span>
      <span className="inline-flex h-7 items-center self-start rounded-full px-3 type-label" style={{ color: fg, background: bg }}>
        {name || "Product"}
      </span>
      <span className="type-h2" style={{ color: fg }}>
        Accent headline
      </span>
    </div>
  );
}

export function ColorPair({ value, onChange, name, others }: { value: ProductColors; onChange: (v: ProductColors) => void; name: string; others: { name: string; color_light: string }[] }) {
  const set = (k: keyof ProductColors) => (v: string) => onChange({ ...value, [k]: v });
  const warnings = colorWarnings(value, others);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField label="Colour (light mode)" value={value.color_light} onChange={set("color_light")} hint="Text and icons on white." />
        <ColorField label="Soft background (light mode)" value={value.color_soft_light} onChange={set("color_soft_light")} hint="Very light tint of the same hue." />
        <ColorField label="Colour (dark mode)" value={value.color_dark} onChange={set("color_dark")} hint="Lighter, for the dark background." />
        <ColorField label="Soft background (dark mode)" value={value.color_soft_dark} onChange={set("color_soft_dark")} hint="Very dark tint of the same hue." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Preview fg={value.color_light} bg={value.color_soft_light} surface={SURFACE_LIGHT} name={name} />
        <Preview fg={value.color_dark} bg={value.color_soft_dark} surface={SURFACE_DARK} name={name} dark />
      </div>
      {warnings.length ? (
        <Alert tone="warning" title="Check these colours">
          <ul className="list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert tone="success">Readable in both themes and distinct from the brand and other products.</Alert>
      )}
    </div>
  );
}
