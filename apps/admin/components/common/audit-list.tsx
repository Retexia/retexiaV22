import { formatDate } from "@retexia/ui";
import { label } from "./status";

export type AuditEntry = {
  id: string;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  summary: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
};

const SKIP = new Set(["updated_at", "created_at", "search"]);

/** Fields that changed between before and after (for update rows). */
export function auditDiff(before: unknown, after: unknown) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !SKIP.has(k));
  return keys
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ key: k, before: b[k], after: a[k] }));
}

const show = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

/** Audit entries with a before/after diff. */
export function AuditList({ entries, showTable = false }: { entries: AuditEntry[]; showTable?: boolean }) {
  if (!entries.length) return <p className="py-6 text-center type-body text-ink-muted">No changes recorded yet.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line">
      {entries.map((e) => {
        const diff = e.action === "update" ? auditDiff(e.before, e.after) : [];
        return (
          <li key={e.id} className="flex flex-col gap-2 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-sm bg-surface-sunk px-1.5 type-caption text-ink-muted">{e.action}</span>
              {showTable && e.table_name ? <span className="type-label text-ink">{label(e.table_name)}</span> : null}
              <span className="type-small text-ink-muted">
                {e.actor_email ?? "System"}
                {e.actor_role ? ` (${e.actor_role})` : ""} · {formatDate(e.created_at, "en-LK", true)}
              </span>
            </div>
            {e.summary ? <p className="type-body text-ink">{e.summary}</p> : null}
            {diff.length ? (
              <details className="rounded-md border border-line bg-surface-sunk/50 px-3 py-2">
                <summary className="cursor-pointer type-small text-ink-muted">
                  {diff.length} field{diff.length === 1 ? "" : "s"} changed: {diff.map((d) => d.key).slice(0, 5).join(", ")}
                </summary>
                <dl className="mt-2 grid gap-2">
                  {diff.map((d) => (
                    <div key={d.key} className="grid gap-1 sm:grid-cols-[160px_1fr_1fr] sm:gap-3">
                      <dt className="type-code text-ink-muted">{d.key}</dt>
                      <dd className="type-small break-all text-danger line-through decoration-danger/40">{show(d.before)}</dd>
                      <dd className="type-small break-all text-success">{show(d.after)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : e.action === "insert" || e.action === "delete" ? (
              <details className="rounded-md border border-line bg-surface-sunk/50 px-3 py-2">
                <summary className="cursor-pointer type-small text-ink-muted">{e.action === "insert" ? "Created with" : "Deleted record"}</summary>
                <pre className="mt-2 overflow-x-auto type-code text-ink-muted">{JSON.stringify(e.after ?? e.before, null, 2)}</pre>
              </details>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
