"use client";

import { Badge, Button, Card, Input, Textarea, cn } from "@retexia/ui";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { resetString, saveString } from "@/app/(panel)/website/actions";

export type StringRow = {
  key: string;
  fallback: string | null;
  file: string | null;
  value: string | null;
  description: string | null;
  state: "default" | "changed" | "missing" | "unused";
};

const STATES = [
  { key: "all", label: "All" },
  { key: "changed", label: "Changed" },
  { key: "missing", label: "Not in database" },
  { key: "unused", label: "Not used by the site" },
] as const;

const GROUP_LABELS: Record<string, string> = {
  account: "Account area",
  auth: "Sign in and sign up",
  common: "Everywhere",
  contact: "Contact",
  error: "Errors",
  faq: "FAQ",
  footer: "Footer",
  form: "Form messages",
  hero: "Hero",
  maintenance: "Maintenance",
  nav: "Menu",
  onboarding: "Order form",
  order: "Order page",
  pricing: "Pricing",
  product: "Products",
  services: "Services",
  theme: "Theme switch",
  waitlist: "Waitlist",
};

export function StringsEditor({ rows }: { rows: StringRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [state, setState] = useState<(typeof STATES)[number]["key"]>("all");
  const [group, setGroup] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const groups = useMemo(() => [...new Set(rows.map((r) => r.key.split(".")[0] ?? ""))].sort(), [rows]);
  const counts = useMemo(() => Object.fromEntries(STATES.map((s) => [s.key, s.key === "all" ? rows.length : rows.filter((r) => r.state === s.key).length])), [rows]);
  const shown = rows.filter((r) => {
    if (state !== "all" && r.state !== state) return false;
    if (group !== "all" && !r.key.startsWith(`${group}.`)) return false;
    if (!q) return true;
    const needle = q.toLowerCase();
    return [r.key, r.value, r.fallback].some((v) => v?.toLowerCase().includes(needle));
  });
  const byGroup = shown.reduce<Record<string, StringRow[]>>((m, r) => {
    const g = r.key.split(".")[0] ?? "";
    (m[g] ??= []).push(r);
    return m;
  }, {});

  const save = async (r: StringRow, value: string) => {
    setSaving(r.key);
    const res = await saveString({ key: r.key, value, description: r.description ?? (r.file ? `Used in ${r.file}` : undefined) });
    setSaving(null);
    if (!res.ok) return toast.error(res.message);
    toast.success(res.message ?? "Saved");
    setDrafts(({ [r.key]: _, ...rest }) => rest);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {counts.missing || counts.unused ? (
        <Card className="flex flex-col gap-1 border-warning/40!">
          <h2 className="type-label text-ink">Missing keys report</h2>
          <p className="type-small text-ink-muted">
            {counts.missing ? `${counts.missing} text${counts.missing === 1 ? "" : "s"} used by the website ${counts.missing === 1 ? "is" : "are"} not in the database yet; the built-in wording is shown. Save one to make it editable. ` : ""}
            {counts.unused ? `${counts.unused} database text${counts.unused === 1 ? " is" : "s are"} no longer used by the website and can be removed.` : ""}
          </p>
        </Card>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search texts" placeholder="Search key or wording" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select
          aria-label="Area"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="h-10 rounded-md border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:focus-ring"
        >
          <option value="all">All areas</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABELS[g] ?? g}
            </option>
          ))}
        </select>
        <nav aria-label="Filter" className="flex flex-wrap gap-1">
          {STATES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={state === s.key}
              onClick={() => setState(s.key)}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 type-label", state === s.key ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk")}
            >
              {s.label} <span className="type-small">{counts[s.key]}</span>
            </button>
          ))}
        </nav>
      </div>
      {Object.entries(byGroup).map(([g, list]) => (
        <Card key={g} padded={false}>
          <h2 className="border-b border-line px-5 py-3 type-h3 text-ink">{GROUP_LABELS[g] ?? g}</h2>
          <ul className="divide-y divide-line">
            {list.map((r) => {
              const current = drafts[r.key] ?? r.value ?? r.fallback ?? "";
              const dirty = drafts[r.key] !== undefined && drafts[r.key] !== (r.value ?? r.fallback ?? "");
              return (
                <li key={r.key} className="grid gap-2 px-5 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="truncate type-code text-ink">{r.key}</code>
                      {r.state === "changed" ? <Badge tone="brand">Changed</Badge> : null}
                      {r.state === "missing" ? <Badge tone="warning">Not in database</Badge> : null}
                      {r.state === "unused" ? <Badge tone="neutral">Not used</Badge> : null}
                    </span>
                    {r.file ? <span className="truncate type-small text-ink-muted">{r.file}</span> : null}
                    {r.state === "changed" && r.fallback ? <span className="type-small text-ink-muted">Default: {r.fallback}</span> : null}
                  </div>
                  <div className="flex items-start gap-2">
                    <Textarea
                      aria-label={`Text for ${r.key}`}
                      rows={current.length > 80 ? 3 : 1}
                      value={current}
                      onChange={(e) => setDrafts({ ...drafts, [r.key]: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(r, current);
                      }}
                      className="min-h-10"
                    />
                    {dirty || r.state === "missing" ? (
                      <Button size="sm" loading={saving === r.key} onClick={() => save(r, current)}>
                        Save
                      </Button>
                    ) : null}
                    {r.state === "changed" || r.state === "unused" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<RotateCcw aria-hidden size={14} strokeWidth={1.5} />}
                        onClick={async () => {
                          // Changed → back to the built-in wording; unused → remove the row.
                          const res = r.state === "unused" || r.fallback === null ? await resetString({ key: r.key }) : await saveString({ key: r.key, value: r.fallback, description: r.description ?? undefined });
                          setDrafts(({ [r.key]: _, ...rest }) => rest);
                          toast[res.ok ? "success" : "error"](res.message ?? "");
                          if (res.ok) router.refresh();
                        }}
                      >
                        {r.state === "unused" ? "Remove" : "Default"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      {shown.length === 0 ? (
        <Card>
          <p className="type-body text-ink-muted">Nothing matches.</p>
        </Card>
      ) : null}
    </div>
  );
}
