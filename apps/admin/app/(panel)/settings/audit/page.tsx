import { Button, Card } from "@retexia/ui";
import { PageHeader, Pagination } from "@retexia/ui/admin";
import { Download } from "lucide-react";
import Link from "next/link";
import { AuditList, type AuditEntry } from "@/components/common/audit-list";
import { requireStaffPage } from "@/lib/auth";
import { PAGE_SIZE, listParams, param, withParams, type SearchParams } from "@/lib/list-params";
import { auditQuery } from "@/lib/queries/audit";

export const metadata = { title: "Audit log" };

const ACTIONS = ["insert", "update", "delete", "status_change", "secret.set", "secret.reveal", "action.run", "action.callback", "action.test", "export", "auth.delete", "staff.invited", "form.save", "notification.retry"];

const inputClass = "h-9 rounded-md border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:border-brand focus-visible:focus-ring";

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const staff = await requireStaffPage("manageSettings");
  const { page, from: rangeFrom, to: rangeTo } = listParams(sp, { id: "created_at", desc: true });
  const [{ data, count }, { data: tables }, { data: team }] = await Promise.all([
    auditQuery(staff, sp).range(rangeFrom, rangeTo),
    staff.supabase.from("audit_logs").select("table_name").not("table_name", "is", null).order("table_name").limit(2000),
    staff.supabase.from("profiles").select("email").neq("role", "customer").order("email"),
  ]);
  const tableNames = [...new Set((tables ?? []).map((t) => t.table_name).filter(Boolean))] as string[];
  const exportHref = withParams("/api/export/audit", sp, { page: null });
  const filtered = ["actor", "action", "table", "record", "from", "to", "q"].some((k) => param(sp, k));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Every change in the admin and the database: who, when, and what changed."
        actions={
          <Button href={exportHref} variant="secondary" size="sm" icon={<Download aria-hidden size={14} strokeWidth={1.5} />}>
            Export CSV
          </Button>
        }
      />
      <form method="get" action="/settings/audit" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 type-small text-ink-muted">
          Search
          <input name="q" type="search" data-table-search defaultValue={param(sp, "q")} placeholder="Summary, record, email" className={`${inputClass} w-56`} />
        </label>
        <label className="flex flex-col gap-1 type-small text-ink-muted">
          Who
          <select name="actor" defaultValue={param(sp, "actor") ?? ""} className={inputClass}>
            <option value="">Anyone</option>
            {(team ?? []).map((t) => (t.email ? <option key={t.email}>{t.email}</option> : null))}
          </select>
        </label>
        <label className="flex flex-col gap-1 type-small text-ink-muted">
          Action
          <select name="action" defaultValue={param(sp, "action") ?? ""} className={inputClass}>
            <option value="">Any</option>
            {ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 type-small text-ink-muted">
          Table
          <select name="table" defaultValue={param(sp, "table") ?? ""} className={inputClass}>
            <option value="">Any</option>
            {tableNames.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 type-small text-ink-muted">
          From
          <input type="date" name="from" defaultValue={param(sp, "from")} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 type-small text-ink-muted">
          To
          <input type="date" name="to" defaultValue={param(sp, "to")} className={inputClass} />
        </label>
        {param(sp, "record") ? <input type="hidden" name="record" value={param(sp, "record")} /> : null}
        <Button type="submit" size="sm">
          Filter
        </Button>
        {filtered ? (
          <Link href="/settings/audit" className="type-label text-link">
            Clear
          </Link>
        ) : null}
      </form>
      <Card>
        {(data ?? []).length ? <AuditList entries={(data ?? []) as AuditEntry[]} showTable /> : <p className="py-8 text-center type-body text-ink-muted">No entries match.</p>}
      </Card>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(p) => withParams("/settings/audit", sp, { page: p })} />
    </div>
  );
}
