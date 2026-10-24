"use client";

import { Alert, Button, Card } from "@retexia/ui";
import { Boxes, FileSpreadsheet, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

const MAX_TOTAL = 4 * 1024 * 1024; // what one upload can carry (hosting limit)
const OK_TYPE = /\.(xls|csv)$/i;

type Result = { kind: "done"; fileName: string; orders: string | null; summary: string[] } | { kind: "problems"; problems: string[] } | null;

/**
 * Bulk import: Facebook lead files (.xls / .csv) → one courier CSV, built by the
 * Feeder n8n worker and downloaded straight to this computer (nothing is stored).
 */
export function BulkImport({ productCount }: { productCount: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState<string | null>(null);
  const total = files.reduce((s, f) => s + f.size, 0);

  const add = (list: FileList | File[]) => {
    const picked = Array.from(list);
    const bad = picked.filter((f) => !OK_TYPE.test(f.name));
    setError(bad.length ? `Only .xls or .csv lead files from Facebook: ${bad.map((f) => f.name).join(", ")}` : null);
    setFiles((cur) => [...cur, ...picked.filter((f) => OK_TYPE.test(f.name) && !cur.some((c) => c.name === f.name && c.size === f.size))]);
    setResult(null);
  };

  async function build() {
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    for (const f of files) fd.append("files", f, f.name);
    try {
      const res = await fetch("/api/feeder/bulk-import", { method: "POST", body: fd });
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && type.includes("text/csv")) {
        setResult({ kind: "done", ...(await downloadCsv(res)) });
        setFiles([]);
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
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="type-h3 text-ink">Facebook leads → courier CSV</h2>
          <p className="type-body text-ink-muted">
            Add the lead files you downloaded from Facebook Leads Center (.xls or .csv), as many as you like. You get one courier file back, downloaded to this computer. Your files are not kept.
          </p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-sunk px-6 py-10 text-center hover:border-ink-muted focus-visible:focus-ring"
        >
          <Upload aria-hidden size={24} strokeWidth={1.5} className="text-ink-muted" />
          <span className="type-label text-ink">Drop lead files here, or choose them</span>
          <span className="type-small text-ink-muted">.xls or .csv, exactly as downloaded from Facebook</span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".xls,.csv"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="flex items-center gap-3 px-4 py-2.5">
                <FileSpreadsheet aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate type-body text-ink">{f.name}</span>
                <span className="type-small text-ink-muted">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setFiles((cur) => cur.filter((x) => x !== f))}
                  className="rounded-full p-1 text-ink-muted hover:text-ink focus-visible:focus-ring"
                >
                  <X aria-hidden size={14} strokeWidth={1.5} />
                  <span className="sr-only">Remove {f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {total > MAX_TOTAL ? <Alert tone="warning">These files are over 4 MB together. Build the CSV in two goes (a few files each time).</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button className="self-start" loading={busy} disabled={!files.length || total > MAX_TOTAL} onClick={build}>
          {busy ? "Building…" : "Build courier CSV"}
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

/** Where prices, item codes and delivery fees come from: the customer's products and form names. */
export function ProductsCard({ count }: { count: number }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="type-h3 text-ink">Your products</h2>
        <p className="type-body text-ink-muted">
          {count
            ? `${count} product${count === 1 ? "" : "s"} with your form names. Each lead from those forms gets that product's item code, your price and the delivery fee. A new form? Add its name there first.`
            : "Add the products you sell and your form names for each, so every lead lands on the right product, item code and price."}
        </p>
      </div>
      <Button href="/products" variant={count ? "secondary" : "primary"} icon={<Boxes aria-hidden size={16} strokeWidth={1.5} />}>
        {count ? "My products" : "Add my products"}
      </Button>
    </Card>
  );
}

/** Saves the courier CSV the worker sent back to this computer. */
export async function downloadCsv(res: Response) {
  const blob = await res.blob();
  const name = decodeURIComponent(/filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "orders.csv");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { fileName: name, orders: res.headers.get("x-feeder-orders"), summary: decodeURIComponent(res.headers.get("x-feeder-summary") ?? "").split("\n").filter(Boolean) };
}
