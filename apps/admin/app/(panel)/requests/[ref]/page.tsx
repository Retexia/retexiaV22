import { parseForm, type FormValues } from "@retexia/forms";
import { can } from "@retexia/supabase";
import { Card, ProductChip, formatDate, formatPrice } from "@retexia/ui";
import { DescriptionList, LinkTabs, PageHeader } from "@retexia/ui/admin";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditList, type AuditEntry } from "@/components/common/audit-list";
import { OrderStatus, label } from "@/components/common/status";
import { ChangePricingButton, EditAnswersButton } from "@/components/requests/overview-editors";
import { PaymentsPanel, type PaymentRow } from "@/components/requests/payments-panel";
import { RequestActions, type TransitionOption } from "@/components/requests/request-actions";
import { ServiceSetup, type ServiceField } from "@/components/requests/service-setup";
import { Timeline, type TimelineItem } from "@/components/requests/timeline";
import { requireStaffPage } from "@/lib/auth";
import { param, type SearchParams } from "@/lib/list-params";
import { productExtension } from "@/products/registry";

type Params = Promise<{ ref: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).ref) };
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "setup", label: "Service setup" },
  { key: "payments", label: "Payments" },
  { key: "timeline", label: "Timeline" },
  { key: "activity", label: "Activity" },
] as const;

const waNumber = (n: string | null | undefined) => (n ?? "").replace(/[^\d]/g, "");

export default async function RequestPage({ params, searchParams }: { params: Params; searchParams: Promise<SearchParams> }) {
  const [{ ref: rawRef }, sp] = await Promise.all([params, searchParams]);
  const ref = decodeURIComponent(rawRef);
  const staff = await requireStaffPage("view");
  const { supabase, role } = staff;
  const canOperate = can(role, "operate");
  const canAdmin = can(role, "manageSettings");

  const { data: order } = await supabase.from("staff_orders").select("*").eq("ref", ref).maybeSingle();
  if (!order?.id) notFound();
  const orderId = order.id;
  const tab = (param(sp, "tab") ?? "overview") as (typeof TABS)[number]["key"];

  const [statuses, transitions, payments, team, product, packages, notes, events, runs, fields, actions, secrets, auditRows] = await Promise.all([
    supabase.from("order_statuses").select("key, label, description").order("sort_order"),
    supabase.from("order_status_transitions").select("*").eq("from_status", order.status ?? "").order("sort_order"),
    supabase.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["support", "editor", "admin", "owner"]),
    supabase.from("products").select("id, panel_url, panel_live, onboarding_form_id").eq("id", order.product_id ?? "").maybeSingle(),
    supabase.from("packages").select("id, name, price_monthly, price_yearly, setup_fee").eq("product_id", order.product_id ?? "").order("sort_order"),
    supabase.from("order_notes").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("order_events").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("action_runs").select("id, action_label, status, error, created_at, finished_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(20),
    supabase.from("product_service_fields").select("*").eq("product_id", order.product_id ?? "").eq("is_visible", true).order("sort_order"),
    supabase.from("product_actions").select("*").eq("product_id", order.product_id ?? "").order("sort_order"),
    supabase.rpc("admin_order_secret_status", { p_order_id: orderId }),
    canAdmin
      ? supabase
          .from("audit_logs")
          .select("*")
          .or(`record_id.eq.${orderId},after->>order_id.eq.${orderId},before->>order_id.eq.${orderId}`)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as AuditEntry[] }),
  ]);

  const statusLabel = Object.fromEntries((statuses.data ?? []).map((s) => [s.key, s.label]));
  const statusRow = (statuses.data ?? []).find((s) => s.key === order.status);
  const people = Object.fromEntries((team.data ?? []).map((p) => [p.id, p.full_name || p.email || "Team member"]));
  const paymentRows = (payments.data ?? []) as unknown as PaymentRow[];
  const hasConfirmedPayment = paymentRows.some((p) => p.status === "confirmed" && ["setup_fee", "subscription"].includes(p.kind));
  const currency = order.currency ?? "LKR";

  const options: TransitionOption[] = (transitions.data ?? []).map((t) => ({
    to_status: t.to_status,
    to_label: statusLabel[t.to_status] ?? label(t.to_status),
    action_label: t.action_label,
    requires_confirmed_payment: t.requires_confirmed_payment,
    requires_reason: t.requires_reason,
    notify_customer_default: t.notify_customer_default,
    customer_note_template: t.customer_note_template,
    allowed: t.min_roles.includes(role),
  }));

  // Answers grouped by the step they were asked in.
  const answers = (Array.isArray(order.answers) ? order.answers : []) as { key: string; label: string; value: unknown; display_value: string; step?: string }[];
  const groups = new Map<string, typeof answers>();
  for (const a of answers) groups.set(a.step || "Answers", [...(groups.get(a.step || "Answers") ?? []), a]);

  let form = null;
  if (canAdmin && order.form_id) {
    const { data: raw } = await supabase.from("forms").select("*, steps:form_steps(*, fields:form_fields(*))").eq("id", order.form_id).maybeSingle();
    if (raw) form = parseForm(raw);
  }

  const phone = waNumber(order.customer_whatsapp ?? order.customer_phone);
  const links = {
    customerView: `/requests/${encodeURIComponent(ref)}/customer-view`,
    whatsapp: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${order.customer_name ?? ""}, about your Retexia request ${ref}: `)}` : null,
    email: order.customer_email ? `mailto:${order.customer_email}?subject=${encodeURIComponent(`Your Retexia request ${ref}`)}` : null,
    panel: product.data?.panel_live && product.data.panel_url ? product.data.panel_url : null,
  };

  const timeline: TimelineItem[] = [
    ...(events.data ?? []).map((e) => ({
      id: e.id,
      kind: "event" as const,
      at: e.created_at,
      title: e.from_status ? `${statusLabel[e.from_status] ?? e.from_status} → ${statusLabel[e.to_status] ?? e.to_status}` : `Submitted as ${statusLabel[e.to_status] ?? e.to_status}`,
      body: e.note,
      by: e.created_by ? (people[e.created_by] ?? "Customer") : "System",
    })),
    ...(notes.data ?? []).map((n) => ({
      id: n.id,
      kind: "note" as const,
      at: n.created_at,
      title: "Internal note",
      body: n.body,
      by: n.author_id ? people[n.author_id] : null,
      pinned: n.pinned,
      canEdit: canOperate && (n.author_id === staff.user.id || canAdmin),
    })),
    ...(runs.data ?? []).map((r) => ({
      id: r.id,
      kind: "run" as const,
      at: r.created_at,
      title: r.action_label ?? "Product action",
      body: r.error,
      badge: label(r.status),
      tone: ({ succeeded: "success", failed: "danger", running: "brand" } as const)[r.status as "succeeded"] ?? "neutral",
    })),
    ...paymentRows.map((p) => ({
      id: p.id,
      kind: "payment" as const,
      at: p.paid_at ?? p.created_at,
      title: `${label(p.kind)} ${formatPrice(p.amount, p.currency ?? currency)}`,
      body: [p.receipt_number, p.reference, p.note].filter(Boolean).join(" · "),
      badge: label(p.status),
      tone: ({ confirmed: "success", pending: "warning", failed: "danger" } as const)[p.status as "confirmed"] ?? "neutral",
    })),
  ];

  const initialValues: FormValues = Object.fromEntries(answers.map((a) => [a.key, a.value as FormValues[string]]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/requests", label: "Requests" }}
        chips={
          <>
            {order.product_slug ? <ProductChip slug={order.product_slug} name={order.product_short_name ?? ""} size="sm" /> : null}
            <OrderStatus label={order.status_label} tone={order.status_tone} fallback={order.status} />
            <span className="type-code text-ink-muted">{ref}</span>
          </>
        }
        title={
          <>
            {order.package_name} for{" "}
            {order.user_id ? (
              <Link href={`/customers/${order.user_id}`} className="text-link hover:text-brand-hover">
                {order.customer_business || order.customer_name || "customer"}
              </Link>
            ) : (
              "a deleted customer"
            )}
          </>
        }
        description={statusRow?.description}
        actions={
          <RequestActions
            orderId={orderId}
            orderRef={ref}
            transitions={options}
            hasConfirmedPayment={hasConfirmedPayment}
            canOverride={canAdmin}
            canOperate={canOperate}
            assignee={order.assigned_to}
            team={(team.data ?? []).filter((m) => m.role !== "editor").map((m) => ({ id: m.id, name: m.full_name || m.email || "Team member" }))}
            links={links}
          />
        }
      />
      <LinkTabs
        label="Request sections"
        items={TABS.filter((t) => t.key !== "activity" || canAdmin).map((t) => ({
          href: `/requests/${encodeURIComponent(ref)}${t.key === "overview" ? "" : `?tab=${t.key}`}`,
          label: t.label,
          active: tab === t.key,
          count: t.key === "payments" ? paymentRows.length : t.key === "timeline" ? timeline.length : null,
        }))}
      />

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            {groups.size ? (
              [...groups.entries()].map(([step, items], i) => (
                <Card key={step} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="type-h2 text-ink">{step}</h2>
                    {i === 0 && form ? <EditAnswersButton orderId={orderId} orderRef={ref} form={form} initial={initialValues} /> : null}
                  </div>
                  <DescriptionList
                    columns={2}
                    items={items.map((a) => ({ label: a.label, value: <span className="whitespace-pre-line">{a.display_value}</span>, wide: String(a.display_value).length > 60 }))}
                  />
                </Card>
              ))
            ) : (
              <Card>
                <p className="type-body text-ink-muted">This request has no form answers.</p>
              </Card>
            )}
          </div>
          <div className="flex flex-col gap-6">
            <Card className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="type-h2 text-ink">Package and price</h2>
                {canAdmin ? (
                  <ChangePricingButton
                    orderId={orderId}
                    orderRef={ref}
                    currency={currency}
                    current={{ packageId: order.package_id ?? "", billing: order.billing_cycle ?? "monthly", price: Number(order.price_amount ?? 0), setupFee: Number(order.setup_fee ?? 0) }}
                    packages={(packages.data ?? []).map((p) => ({ ...p, price_monthly: Number(p.price_monthly), price_yearly: p.price_yearly === null ? null : Number(p.price_yearly), setup_fee: Number(p.setup_fee) }))}
                  />
                ) : null}
              </div>
              <DescriptionList
                items={[
                  { label: "Package", value: order.package_name },
                  { label: "Billing", value: label(order.billing_cycle) },
                  { label: "Price", value: `${formatPrice(order.price_amount, currency)} ${order.billing_cycle === "yearly" ? "/ year" : "/ month"}` },
                  { label: "Setup fee", value: formatPrice(order.setup_fee, currency) },
                  { label: "Paid so far", value: formatPrice(order.paid_total, currency) },
                  ...(order.price_override_reason ? [{ label: "Price changed because", value: order.price_override_reason }] : []),
                ]}
              />
            </Card>
            <Card className="flex flex-col gap-4">
              <h2 className="type-h2 text-ink">Dates</h2>
              <DescriptionList
                items={[
                  { label: "Submitted", value: formatDate(order.created_at, "en-LK", true) },
                  { label: "Started", value: order.starts_at ? formatDate(order.starts_at) : null },
                  { label: "Renews", value: order.renews_at ? formatDate(order.renews_at) : null },
                  ...(order.paused_at ? [{ label: "Paused", value: formatDate(order.paused_at) }] : []),
                  ...(order.cancelled_at ? [{ label: "Cancelled", value: formatDate(order.cancelled_at) }] : []),
                  ...(order.cancel_reason ? [{ label: "Reason", value: order.cancel_reason }] : []),
                  { label: "Source", value: label(order.source) },
                  { label: "Form version", value: order.form_version ? `v${order.form_version}` : null },
                ]}
              />
            </Card>
            <Card className="flex flex-col gap-4">
              <h2 className="type-h2 text-ink">Customer</h2>
              <DescriptionList
                items={[
                  { label: "Name", value: order.customer_name },
                  { label: "Business", value: order.customer_business },
                  { label: "Email", value: order.customer_email ? <a href={`mailto:${order.customer_email}`} className="text-link">{order.customer_email}</a> : null },
                  { label: "Phone", value: order.customer_phone },
                  { label: "WhatsApp", value: order.customer_whatsapp },
                  ...(order.customer_note ? [{ label: "Customer's note", value: order.customer_note }] : []),
                ]}
              />
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "setup" ? (
        <ServiceSetup
          orderId={orderId}
          orderRef={ref}
          status={order.status ?? ""}
          role={role}
          canOperate={canOperate}
          canReveal={canAdmin}
          fields={(fields.data ?? []).map(
            (f): ServiceField => ({
              key: f.key,
              label: f.label,
              type: f.type,
              options: Array.isArray(f.options) ? (f.options as { value: string; label: string }[]) : [],
              help_text: f.help_text,
              visible_to_customer: f.visible_to_customer,
              required_for_status: f.required_for_status,
            }),
          )}
          values={(order.service_data ?? {}) as Record<string, unknown>}
          secrets={(secrets.data ?? {}) as Record<string, string>}
          statusLabels={statusLabel}
          actions={(actions.data ?? []).map((a) => ({
            id: a.id,
            key: a.key,
            label: a.label,
            description: a.description,
            allowed_statuses: a.allowed_statuses,
            min_roles: a.min_roles,
            confirm_text: a.confirm_text,
            is_enabled: a.is_enabled,
          }))}
          runs={runs.data ?? []}
        />
      ) : null}
      {tab === "setup"
        ? await Promise.all((productExtension(order.product_slug).requestPanels ?? []).map(async (panel) => <div key={panel.key}>{await panel.render({ staff, orderId, productSlug: order.product_slug ?? "" })}</div>))
        : null}

      {tab === "payments" ? (
        <PaymentsPanel
          order={{
            id: orderId,
            ref,
            userId: order.user_id,
            currency,
            price: Number(order.price_amount ?? 0),
            setupFee: Number(order.setup_fee ?? 0),
            billing: order.billing_cycle ?? "monthly",
            renewsAt: order.renews_at,
          }}
          payments={paymentRows}
          canOperate={canOperate}
          canAdmin={canAdmin}
        />
      ) : null}

      {tab === "timeline" ? <Timeline orderId={orderId} orderRef={ref} items={timeline} canOperate={canOperate} /> : null}

      {tab === "activity" && canAdmin ? (
        <Card>
          <AuditList entries={(auditRows.data ?? []) as AuditEntry[]} showTable />
        </Card>
      ) : null}
    </div>
  );
}
