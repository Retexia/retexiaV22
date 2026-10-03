import { can, roleLabels, type Role } from "@retexia/supabase";
import { Avatar, Badge, Card, StatusBadge, formatDate, formatPrice, type Tone } from "@retexia/ui";
import { DescriptionList, LinkTabs, PageHeader } from "@retexia/ui/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditList, type AuditEntry } from "@/components/common/audit-list";
import { OrderStatus, ProductTag, label, paymentStatusTone } from "@/components/common/status";
import { AccountActions, CustomerNotes, ProfileCard } from "@/components/customers/customer-panels";
import { requireStaffPage } from "@/lib/auth";
import { param, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Customer" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "requests", label: "Requests" },
  { key: "payments", label: "Payments" },
  { key: "messages", label: "Messages" },
  { key: "notes", label: "Notes" },
  { key: "activity", label: "Activity" },
] as const;

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const staff = await requireStaffPage("view");
  const { supabase, role } = staff;
  const canAdmin = can(role, "manageSettings");
  const tab = (param(sp, "tab") ?? "overview") as (typeof TABS)[number]["key"];

  const { data: c } = await supabase.from("staff_customers").select("*").eq("id", id).maybeSingle();
  if (!c?.id) notFound();

  const email = c.email ?? "";
  const [orders, payments, messages, waitlist, notes, team, audit, settings] = await Promise.all([
    supabase.from("staff_orders").select("id, ref, status, status_label, status_tone, product_slug, product_short_name, package_name, price_amount, currency, billing_cycle, created_at, renews_at").eq("user_id", id).order("created_at", { ascending: false }),
    supabase.from("staff_payments").select("id, order_ref, kind, signed_amount, currency, status, paid_at, created_at, receipt_number").eq("user_id", id).order("created_at", { ascending: false }),
    email
      ? supabase.from("contact_messages").select("id, subject, message, status, created_at, source_path").or(`user_id.eq.${id},email.eq."${email}"`).order("created_at", { ascending: false })
      : supabase.from("contact_messages").select("id, subject, message, status, created_at, source_path").eq("user_id", id),
    email
      ? supabase.from("waitlist").select("id, created_at, products(name, slug)").or(`user_id.eq.${id},email.eq."${email.toLowerCase()}"`)
      : supabase.from("waitlist").select("id, created_at, products(name, slug)").eq("user_id", id),
    supabase.from("customer_notes").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email").neq("role", "customer"),
    canAdmin ? supabase.from("audit_logs").select("*").eq("record_id", id).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] as AuditEntry[] }),
    supabase.from("site_settings").select("currency_code").eq("id", 1).maybeSingle(),
  ]);
  const people = Object.fromEntries((team.data ?? []).map((p) => [p.id, p.full_name || p.email || "Team member"]));
  const currency = settings.data?.currency_code ?? "LKR";
  const isStaff = c.role !== "customer";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: isStaff ? "/settings/team" : "/customers", label: isStaff ? "Team" : "Customers" }}
        chips={
          <>
            {c.is_banned ? <Badge tone="danger">Banned</Badge> : c.email_confirmed_at ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Email not confirmed</Badge>}
            {isStaff ? <Badge tone="brand">{roleLabels[c.role as Role] ?? c.role}</Badge> : null}
            {(c.active_products ?? []).map((slug) => (
              <ProductTag key={slug} slug={slug} name={slug} />
            ))}
          </>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={c.full_name ?? email} size={40} />
            {c.full_name || email || "Customer"}
          </span>
        }
        description={[c.business_name, email, c.phone].filter(Boolean).join(" · ")}
      />
      <LinkTabs
        label="Customer sections"
        items={TABS.filter((t) => t.key !== "activity" || canAdmin).map((t) => ({
          href: `/customers/${id}${t.key === "overview" ? "" : `?tab=${t.key}`}`,
          label: t.label,
          active: tab === t.key,
          count:
            t.key === "requests"
              ? (orders.data ?? []).length
              : t.key === "payments"
                ? (payments.data ?? []).length
                : t.key === "messages"
                  ? (messages.data ?? []).length + (waitlist.data ?? []).length
                  : t.key === "notes"
                    ? (notes.data ?? []).length
                    : null,
        }))}
      />

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ProfileCard
            canEdit={can(role, "manageCustomers")}
            profile={{
              id,
              full_name: c.full_name ?? "",
              email,
              phone: c.phone ?? "",
              whatsapp: c.whatsapp ?? "",
              business_name: c.business_name ?? "",
              marketing_opt_in: Boolean(c.marketing_opt_in),
              role: (c.role ?? "customer") as Role,
              is_banned: Boolean(c.is_banned),
              email_confirmed: Boolean(c.email_confirmed_at),
            }}
          />
          <div className="flex flex-col gap-6">
            <Card className="flex flex-col gap-4">
              <h2 className="type-h2 text-ink">At a glance</h2>
              <DescriptionList
                items={[
                  { label: "Lifetime paid", value: formatPrice(c.lifetime_paid, currency) },
                  { label: "Requests", value: c.orders_count },
                  { label: "Joined", value: formatDate(c.created_at) },
                  { label: "Last sign-in", value: c.last_sign_in_at ? formatDate(c.last_sign_in_at, "en-LK", true) : "Never" },
                  ...(isStaff ? [{ label: "Two-step sign-in", value: c.mfa_enabled ? "On" : "Not set up" }] : []),
                ]}
              />
            </Card>
            <AccountActions
              canManage={can(role, "manageCustomers")}
              isOwner={can(role, "manageTeam")}
              isSelf={id === staff.user.id}
              profile={{
                id,
                full_name: c.full_name ?? "",
                email,
                phone: c.phone ?? "",
                whatsapp: c.whatsapp ?? "",
                business_name: c.business_name ?? "",
                marketing_opt_in: Boolean(c.marketing_opt_in),
                role: (c.role ?? "customer") as Role,
                is_banned: Boolean(c.is_banned),
                email_confirmed: Boolean(c.email_confirmed_at),
              }}
            />
          </div>
        </div>
      ) : null}

      {tab === "requests" ? (
        <Card padded={false}>
          {(orders.data ?? []).length ? (
            <ul className="divide-y divide-line">
              {(orders.data ?? []).map((o) => (
                <li key={o.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/requests/${encodeURIComponent(o.ref ?? "")}`} className="type-code text-link hover:text-brand-hover">
                      {o.ref}
                    </Link>
                    <ProductTag slug={o.product_slug} name={o.product_short_name} />
                    <span className="type-body text-ink">{o.package_name}</span>
                    <OrderStatus label={o.status_label} tone={o.status_tone} fallback={o.status} />
                  </div>
                  <span className="type-small text-ink-muted">
                    {formatPrice(o.price_amount, o.currency ?? currency)} / {o.billing_cycle === "yearly" ? "year" : "month"} · {formatDate(o.created_at)}
                    {o.renews_at && o.status === "active" ? ` · renews ${formatDate(o.renews_at)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-12 text-center type-body text-ink-muted">No requests yet.</p>
          )}
        </Card>
      ) : null}

      {tab === "payments" ? (
        <Card padded={false}>
          {(payments.data ?? []).length ? (
            <ul className="divide-y divide-line">
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="type-label">{formatPrice(p.signed_amount, p.currency ?? currency)}</span>
                    <StatusBadge tone={(paymentStatusTone[p.status ?? ""] ?? "neutral") as Tone} label={label(p.status)} />
                    <span className="type-small text-ink-muted">{label(p.kind)} · {p.order_ref}</span>
                  </span>
                  <span className="flex items-center gap-3 type-small text-ink-muted">
                    {formatDate(p.paid_at ?? p.created_at)}
                    {p.receipt_number ? (
                      <a href={`/print/receipt/${p.id}`} target="_blank" rel="noopener noreferrer" className="type-code text-link">
                        {p.receipt_number}
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-12 text-center type-body text-ink-muted">No payments yet.</p>
          )}
        </Card>
      ) : null}

      {tab === "messages" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="flex flex-col gap-3">
            <h2 className="type-h2 text-ink">Messages</h2>
            {(messages.data ?? []).length ? (
              <ul className="flex flex-col divide-y divide-line">
                {(messages.data ?? []).map((m) => (
                  <li key={m.id} className="flex flex-col gap-1 py-3">
                    <span className="flex items-center gap-2 type-small text-ink-muted">
                      <Badge tone={m.status === "new" ? "brand" : "neutral"}>{m.status}</Badge>
                      {formatDate(m.created_at, "en-LK", true)} · {m.source_path}
                    </span>
                    <Link href={`/inbox?open=${m.id}`} className="type-body text-ink hover:text-brand">
                      {m.subject ? <strong className="font-medium">{m.subject}: </strong> : null}
                      {m.message.slice(0, 220)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-body text-ink-muted">No messages.</p>
            )}
          </Card>
          <Card className="flex flex-col gap-3 self-start">
            <h2 className="type-h2 text-ink">Waitlists</h2>
            {(waitlist.data ?? []).length ? (
              <ul className="flex flex-col gap-2">
                {(waitlist.data ?? []).map((w) => {
                  const p = w.products as { name?: string; slug?: string } | null;
                  return (
                    <li key={w.id} className="flex items-center justify-between gap-2 type-body">
                      <ProductTag slug={p?.slug} name={p?.name} />
                      <span className="type-small text-ink-muted">{formatDate(w.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="type-body text-ink-muted">Not on any waitlist.</p>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "notes" ? (
        <CustomerNotes
          userId={id}
          canOperate={can(role, "operate")}
          notes={(notes.data ?? []).map((n) => ({
            id: n.id,
            body: n.body,
            pinned: n.pinned,
            created_at: n.created_at,
            author: n.author_id ? (people[n.author_id] ?? null) : null,
            canEdit: can(role, "operate") && (n.author_id === staff.user.id || canAdmin),
          }))}
        />
      ) : null}

      {tab === "activity" && canAdmin ? (
        <Card>
          <AuditList entries={(audit.data ?? []) as AuditEntry[]} showTable />
        </Card>
      ) : null}
    </div>
  );
}
