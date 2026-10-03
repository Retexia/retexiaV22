"use client";

import { Alert, Badge, Button, Card, StatusBadge } from "@retexia/ui";
import { AA_TEXT, ColorField, contrastRatio } from "@retexia/ui/admin";
import { colorTokens } from "@retexia/ui/tokens";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { saveTheme } from "@/app/(panel)/settings/actions";
import { SaveBar } from "./save-bar";

type Mode = "light" | "dark";
type Overrides = Record<string, { light?: string; dark?: string }>;

const GROUPS: { title: string; tokens: (keyof typeof colorTokens)[] }[] = [
  { title: "Backgrounds and lines", tokens: ["surface", "surface-raised", "surface-sunk", "line", "line-strong"] },
  { title: "Text", tokens: ["ink", "ink-muted", "link"] },
  { title: "Brand", tokens: ["brand", "brand-hover", "brand-soft", "brand-halo", "on-brand"] },
  { title: "Status", tokens: ["success", "success-soft", "warning", "warning-soft", "danger", "danger-soft", "on-danger"] },
];

const PAIRS: { fg: keyof typeof colorTokens; bg: keyof typeof colorTokens; min: number; label: string }[] = [
  { fg: "ink", bg: "surface", min: AA_TEXT, label: "Text on page" },
  { fg: "ink-muted", bg: "surface", min: AA_TEXT, label: "Muted text on page" },
  { fg: "ink-muted", bg: "surface-sunk", min: AA_TEXT, label: "Muted text on tinted" },
  { fg: "link", bg: "surface", min: AA_TEXT, label: "Links" },
  { fg: "brand", bg: "brand-soft", min: AA_TEXT, label: "Brand on soft brand" },
  { fg: "on-brand", bg: "brand", min: AA_TEXT, label: "Button text" },
  { fg: "success", bg: "success-soft", min: AA_TEXT, label: "Success badge" },
  { fg: "warning", bg: "warning-soft", min: AA_TEXT, label: "Warning badge" },
  { fg: "danger", bg: "danger-soft", min: AA_TEXT, label: "Error badge" },
  { fg: "on-danger", bg: "danger", min: AA_TEXT, label: "Danger button" },
  { fg: "line-strong", bg: "surface", min: 3, label: "Form borders" },
];

const resolve = (o: Overrides, mode: Mode) =>
  Object.fromEntries(Object.entries(colorTokens).map(([k, v]) => [k, o[k]?.[mode] || v[mode]])) as Record<keyof typeof colorTokens, string>;

function Preview({ colors, mode }: { colors: Record<string, string>; mode: Mode }) {
  const style = Object.fromEntries(Object.entries(colors).map(([k, v]) => [`--rx-${k}`, v])) as CSSProperties;
  return (
    <div style={style} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5" aria-label={`${mode} preview`}>
      <span className="type-small text-ink-muted">{mode === "light" ? "Light mode" : "Dark mode"}</span>
      <span className="self-start rounded-full bg-brand-soft px-3 py-1 type-label text-brand">For small businesses</span>
      <h3 className="type-h2 text-ink">
        Your WhatsApp, <span className="text-brand">answered</span>
      </h3>
      <p className="type-body text-ink-muted">
        Muted body text with a <span className="text-link underline">link</span>.
      </p>
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex h-9 items-center rounded-full bg-brand px-4 type-label text-on-brand">Primary</span>
        <span className="inline-flex h-9 items-center rounded-full border border-line-strong bg-surface-raised px-4 type-label text-ink">Secondary</span>
      </div>
      <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunk p-3">
        <span className="type-small text-ink-muted">Tinted section</span>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="success" label="Active" />
          <StatusBadge tone="warning" label="Awaiting payment" />
          <StatusBadge tone="danger" label="Not accepted" />
          <Badge tone="brand">Brand</Badge>
        </div>
      </div>
      <div className="h-10 rounded-md border border-line-strong bg-surface-raised px-3 type-body leading-10 text-ink-muted">Form field</div>
    </div>
  );
}

/** `lengths` (radius, container…) are kept as they are; only colours are edited here. */
export function ThemeEditor({ initial, lengths }: { initial: Overrides; lengths: Record<string, string> }) {
  const router = useRouter();
  const [o, setO] = useState<Overrides>(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(o) !== JSON.stringify(initial);
  const light = resolve(o, "light");
  const dark = resolve(o, "dark");
  const set = (token: string, mode: Mode, value: string) =>
    setO((x) => {
      const next = { ...x, [token]: { ...x[token], [mode]: value } };
      if (value === colorTokens[token as keyof typeof colorTokens][mode]) delete next[token]![mode];
      if (!next[token]?.light && !next[token]?.dark) delete next[token];
      return next;
    });
  const failures = PAIRS.flatMap((p) =>
    (["light", "dark"] as const).flatMap((mode) => {
      const c = mode === "light" ? light : dark;
      const r = contrastRatio(c[p.fg], c[p.bg]);
      return r !== null && r < p.min ? [`${p.label} (${mode}): ${r.toFixed(2)}:1, needs ${p.min}:1`] : [];
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Preview colors={light} mode="light" />
        <Preview colors={dark} mode="dark" />
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h2 text-ink">Contrast check</h2>
        {failures.length ? (
          <Alert tone="warning" title={`${failures.length} pair${failures.length === 1 ? "" : "s"} below WCAG AA`}>
            <ul className="list-disc pl-5">
              {failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <Alert tone="success">Every text and button pair meets WCAG AA in light and dark mode.</Alert>
        )}
        <div className="overflow-x-auto">
          <table className="w-full type-small">
            <thead>
              <tr className="text-left text-ink-muted">
                <th className="py-1 pr-4 font-medium">Pair</th>
                <th className="py-1 pr-4 font-medium">Light</th>
                <th className="py-1 font-medium">Dark</th>
              </tr>
            </thead>
            <tbody>
              {PAIRS.map((p) => (
                <tr key={p.label} className="border-t border-line">
                  <td className="py-1.5 pr-4 text-ink">{p.label}</td>
                  {[light, dark].map((c, i) => {
                    const r = contrastRatio(c[p.fg], c[p.bg]);
                    return (
                      <td key={i} className={`py-1.5 pr-4 ${r !== null && r < p.min ? "text-danger" : "text-ink-muted"}`}>
                        {r === null ? "—" : `${r.toFixed(2)}:1`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {GROUPS.map((g) => (
        <Card key={g.title} className="flex flex-col gap-4">
          <h2 className="type-h2 text-ink">{g.title}</h2>
          <ul className="flex flex-col divide-y divide-line">
            {g.tokens.map((t) => (
              <li key={t} className="grid items-end gap-3 py-3 sm:grid-cols-[160px_1fr_1fr_auto]">
                <span className="flex flex-col pb-2">
                  <code className="type-code text-ink">{t}</code>
                  {o[t] ? <span className="type-small text-brand">Changed</span> : null}
                </span>
                <ColorField label="Light" value={light[t]} onChange={(v) => set(t, "light", v)} />
                <ColorField label="Dark" value={dark[t]} onChange={(v) => set(t, "dark", v)} />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!o[t]}
                  icon={<RotateCcw aria-hidden size={14} strokeWidth={1.5} />}
                  onClick={() =>
                    setO((x) => {
                      const { [t]: _, ...rest } = x;
                      return rest;
                    })
                  }
                >
                  Default
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <div className="flex justify-start">
        <Button variant="secondary" disabled={!Object.keys(o).length} icon={<RotateCcw aria-hidden size={16} strokeWidth={1.5} />} onClick={() => setO({})}>
          Reset everything to the Retexia defaults
        </Button>
      </div>

      <SaveBar
        dirty={dirty}
        busy={busy}
        label={failures.length ? "Save anyway" : "Save"}
        onDiscard={() => setO(initial)}
        onSave={async () => {
          setBusy(true);
          const r = await saveTheme({ theme: { ...lengths, ...o } });
          setBusy(false);
          toast[r.ok ? "success" : "error"](r.message ?? "");
          if (r.ok) router.refresh();
        }}
      />
    </div>
  );
}
