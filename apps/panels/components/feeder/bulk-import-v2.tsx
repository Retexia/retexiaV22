"use client";

import { Alert, Button, Card, Switch } from "@retexia/ui";
import { FileSpreadsheet, Sheet, Upload, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { FacebookIcon, TikTokIcon } from "@/components/post/brand-icons";
import { ProductsCard, downloadCsv } from "./bulk-import";
import { CrmLinks } from "./crm-links";

const MAX_TOTAL = 4 * 1024 * 1024; // what one upload can carry (hosting limit)

type Source = "facebook" | "tiktok";
const SOURCES: Record<Source, { label: string; accept: string; ok: RegExp; hint: string; icon: ReactNode; steps: ReactNode[] }> = {
  facebook: {
    label: "Facebook leads",
    accept: ".xls,.csv",
    ok: /\.(xls|csv)$/i,
    hint: ".xls or .csv from Facebook Leads Center",
    icon: <FacebookIcon size={18} />,
    steps: [
      <>Open Meta Business Suite → <strong>All tools</strong> → <strong>Leads Center</strong> (or your Page → <strong>Leads</strong>).</>,
      <>Pick the form and the dates, then <strong>Download</strong> → <strong>CSV</strong> (or XLS).</>,
      <>Drop the downloaded files here exactly as they are. Several forms at once are fine.</>,
    ],
  },
  tiktok: {
    label: "TikTok leads",
    accept: ".xlsx,.csv",
    ok: /\.(xlsx|csv)$/i,
    hint: ".xlsx or .csv from TikTok Leads Center",
    icon: <TikTokIcon size={18} />,
    steps: [
      <>Open TikTok Ads Manager → <strong>Tools</strong> → <strong>Leads Center</strong>.</>,
      <>Choose the form and dates, then <strong>Download</strong> (.xlsx or .csv).</>,
      <>Drop the downloaded files here as they are.</>,
    ],
  },
};

const CRM_STEPS: ReactNode[] = [
  <>Open your CRM / orders Google Sheet and click <strong>Share</strong>.</>,
  <>Under <strong>General access</strong> choose <strong>Anyone with the link</strong> → <strong>Viewer</strong>, then <strong>Done</strong>. (Retexia only reads it.)</>,
  <>Open the tab that has the orders, then copy the link from the browser&apos;s address bar (it ends with <code className="type-code">#gid=…</code>, which picks that tab).</>,
  <>Press <strong>Add CRM link</strong> and paste it. Add one for each sheet or tab. Links are saved to your account; tick the ones to read each time.</>,
];

type Result = { kind: "done"; fileName: string; orders: string | null; summary: string[] } | { kind: "problems"; problems: string[] } | null;

function Steps({ title, steps }: { title: string; steps: ReactNode[] }) {
  return (
    <details className="rounded-md border border-line bg-surface-sunk px-4 py-3 type-small text-ink-muted [&_strong]:text-ink">
      <summary className="cursor-pointer type-label text-ink">{title}</summary>
      <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

function DropZone({ source, files, onAdd, onRemove, disabled }: { source: Source; files: File[]; onAdd: (f: File[]) => void; onRemove: (f: File) => void; disabled: boolean }) {
  const s = SOURCES[source];
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 type-label text-ink">
        {s.icon}
        {s.label}
        {files.length ? <span className="type-small text-ink-muted">· {files.length} file{files.length === 1 ? "" : "s"}</span> : null}
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled) onAdd(Array.from(e.dataTransfer.files));
        }}
        className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-surface-sunk px-4 py-7 text-center hover:border-ink-muted focus-visible:focus-ring disabled:opacity-50"
      >
        <Upload aria-hidden size={20} strokeWidth={1.5} className="text-ink-muted" />
        <span className="type-label text-ink">Drop files or choose</span>
        <span className="type-small text-ink-muted">{s.hint}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={s.accept}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files) onAdd(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      {files.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 px-3 py-2">
              <FileSpreadsheet aria-hidden size={14} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate type-small text-ink">{f.name}</span>
              <span className="type-caption text-ink-muted">{Math.max(1, Math.round(f.size / 1024))} KB</span>
              <button type="button" disabled={disabled} onClick={() => onRemove(f)} className="rounded-full p-1 text-ink-muted hover:text-ink focus-visible:focus-ring">
                <X aria-hidden size={14} strokeWidth={1.5} />
                <span className="sr-only">Remove {f.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Steps title={`How to download ${source === "facebook" ? "Facebook" : "TikTok"} leads`} steps={s.steps} />
    </div>
  );
}

/**
 * Bulk import v2: Facebook and TikTok lead files and CRM Google Sheets (view
 * links) → one courier CSV. Either method can be switched off; at least one
 * must be on and have something in it. Nothing is stored: files pass through
 * to the Feeder worker and the CSV downloads to this computer.
 */
export function BulkImportV2({ productCount, crmLinks }: { productCount: number; crmLinks: string[] }) {
  const [useImport, setUseImport] = useState(true);
  const [useCrm, setUseCrm] = useState(crmLinks.length > 0);
  const [files, setFiles] = useState<Record<Source, File[]>>({ facebook: [], tiktok: [] });
  const [chosen, setChosen] = useState<string[]>(crmLinks);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState<string | null>(null);

  const fileCount = files.facebook.length + files.tiktok.length;
  const total = [...files.facebook, ...files.tiktok].reduce((s, f) => s + f.size, 0);
  // Saved links ticked for this build (a removed link drops out).
  const filled = chosen.filter((l) => crmLinks.includes(l));

  const problem = !useImport && !useCrm
    ? "Turn on at least one method: Import lead files or CRM sheets."
    : useImport && !useCrm && !fileCount
      ? "Add at least one Facebook or TikTok lead file."
      : useCrm && !useImport && !filled.length
        ? "Tick or add at least one CRM sheet link."
        : useImport && useCrm && !fileCount && !filled.length
          ? "Add lead files, CRM sheet links, or both."
          : useImport && useCrm && (!fileCount || !filled.length)
            ? `Add ${!fileCount ? "at least one lead file" : "at least one CRM sheet link"}, or switch that method off.`
            : useImport && total > MAX_TOTAL
                ? "The lead files are over 4 MB together. Build in two goes (a few files each time)."
              : null;

  const add = (source: Source, picked: File[]) => {
    const s = SOURCES[source];
    const bad = picked.filter((f) => !s.ok.test(f.name));
    setError(bad.length ? `${s.label}: only ${s.hint.split(" from")[0]} files (${bad.map((f) => f.name).join(", ")}).` : null);
    setFiles((cur) => ({ ...cur, [source]: [...cur[source], ...picked.filter((f) => s.ok.test(f.name) && !cur[source].some((c) => c.name === f.name && c.size === f.size))] }));
    setResult(null);
  };

  async function build() {
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    if (useImport) {
      for (const f of files.facebook) fd.append("facebook", f, f.name);
      for (const f of files.tiktok) fd.append("tiktok", f, f.name);
    }
    if (useCrm) for (const l of filled) fd.append("crm", l);
    try {
      const res = await fetch("/api/feeder/bulk-import", { method: "POST", body: fd });
      if (res.ok && (res.headers.get("content-type") ?? "").includes("text/csv")) {
        setResult({ kind: "done", ...(await downloadCsv(res)) });
        setFiles({ facebook: [], tiktok: [] });
      } else {
        const json = (await res.json().catch(() => null)) as { problems?: string[]; error?: string } | null;
        if (json?.problems?.length) setResult({ kind: "problems", problems: json.problems });
        else setError(json?.error ?? `Something went wrong (${res.status}). Please try again.`);
      }
    } catch {
      setError("Couldn't reach Retexia. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <ProductsCard count={productCount} />

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="type-h3 text-ink">1. Import lead files</h2>
            <p className="type-body text-ink-muted">Facebook and TikTok lead files, as many as you like. Column names don&apos;t matter: Retexia finds the name, phone, address and product.</p>
          </div>
          <Switch checked={useImport} onCheckedChange={setUseImport} label={useImport ? "On" : "Off"} />
        </div>
        {useImport ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {(["facebook", "tiktok"] as const).map((s) => (
              <DropZone
                key={s}
                source={s}
                files={files[s]}
                disabled={busy}
                onAdd={(f) => add(s, f)}
                onRemove={(f) => setFiles((cur) => ({ ...cur, [s]: cur[s].filter((x) => x !== f) }))}
              />
            ))}
          </div>
        ) : (
          <p className="type-small text-ink-muted">Off: lead files are not used this time.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="flex items-center gap-2 type-h3 text-ink">
              <Sheet aria-hidden size={18} strokeWidth={1.5} />
              2. CRM sheets
            </h2>
            <p className="type-body text-ink-muted">Orders from your CRM or order Google Sheets, read straight from their view links every time you build. Your links are saved to your account; tick the ones to use. Any column names.</p>
          </div>
          <Switch checked={useCrm} onCheckedChange={setUseCrm} label={useCrm ? "On" : "Off"} />
        </div>
        {useCrm ? (
          <div className="flex flex-col gap-3">
            <CrmLinks links={crmLinks} selected={filled} onSelectedChange={setChosen} />
            <Steps title="How to get a CRM sheet link" steps={CRM_STEPS} />
          </div>
        ) : (
          <p className="type-small text-ink-muted">Off: CRM sheets are not read this time.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="type-h3 text-ink">3. Build one courier file</h2>
        <p className="type-body text-ink-muted">
          Everything that&apos;s switched on goes into one CSV, with each order matched to your products (price, item code, delivery). The same Facebook or TikTok lead in two files is kept once. It downloads to this computer; nothing is kept on Retexia.
        </p>
        {problem ? <p className="type-small text-ink-muted">{problem}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button className="self-start" size="lg" loading={busy} disabled={Boolean(problem)} onClick={build}>
          {busy ? "Building… (up to a minute)" : "Build courier CSV"}
        </Button>
      </Card>

      {result?.kind === "done" ? (
        <Alert tone="success" title={`${result.fileName} downloaded`}>
          <ul className="flex flex-col gap-0.5">
            {result.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {result?.kind === "problems" ? (
        <Alert
          tone="danger"
          title="The courier file was not created"
          action={
            <Button href="/products" size="sm" variant="secondary">
              My products
            </Button>
          }
        >
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            {result.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}
