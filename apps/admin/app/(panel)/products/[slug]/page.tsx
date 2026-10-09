import { can } from "@retexia/supabase";
import { Alert, Badge, Button, Card, formatDate, formatPrice } from "@retexia/ui";
import { LinkTabs, PageHeader, StatCard } from "@retexia/ui/admin";
import { CheckCircle2, Circle, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatus } from "@/components/common/status";
import { ActionsEditor, type ProductActionRow, type SecretStatus } from "@/components/products/actions-editor";
import { colorWarnings } from "@/components/products/color-check";
import { PackagesManager, type PackageRow } from "@/components/products/packages-manager";
import { ProductDetailsForm, ProductFeaturesEditor, type ChecklistItem } from "@/components/products/product-details";
import { ProductIcon } from "@/components/products/product-icon";
import { ServiceFieldsEditor, type ServiceField } from "@/components/products/service-fields-editor";
import { FaqsEditor } from "@/components/website/faqs-editor";
import { requireStaffPage, type StaffContext } from "@/lib/auth";
import { adminUrl, webUrl } from "@/lib/env";
import { productExtension } from "@/products/registry";
import { param, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Product" };

type Db = StaffContext["supabase"];

const TABS = [
  { key: "overview", label: "Overview", cap: "view" },
  { key: "details", label: "Details", cap: "manageProducts" },
  { key: "packages", label: "Packages", cap: "manageProducts" },
  { key: "page", label: "Page", cap: "editContent" },
  { key: "form", label: "Onboarding form", cap: "manageProducts" },
  { key: "service-fields", label: "Service fields", cap: "manageProducts" },
  { key: "actions", label: "Actions", cap: "manageProducts" },
  { key: "waitlist", label: "Waitlist", cap: "view" },
  { key: "faqs", label: "FAQs", cap: "editContent" },
] as const;

type Tab = (typeof TABS)[number]["key"];

const statusBadge: Record<string, { tone: "success" | "warning" | "neutral"; label: string }> = {
  live: { tone: "success", label: "Live" },
  coming_soon: { tone: "warning", label: "Coming soon" },
  hidden: { tone: "neutral", label: "Hidden" },
};

type Dashboard = {
  new_requests: number;
  waiting_for_action: number;
  active_subscriptions: number;
  mrr: number;
  revenue: number;
  renewals_due: number;
  overdue_renewals: number;
  waitlist_signups: number;
};

export default async function ProductHubPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const staff = await requireStaffPage("view");
  const { supabase, role } = staff;
  const { data: product } = await supabase.from("products").select("*").eq("slug", slug).maybeSingle();
  if (!product) notFound();

  const tabs = TABS.filter((t) => can(role, t.cap));
  const extraTabs = productExtension(product.slug).hubTabs ?? [];
  const requested = param(sp, "tab") ?? "overview";
  const extra = extraTabs.find((t) => t.key === requested);
  const tab = (tabs.some((t) => t.key === requested) ? requested : "overview") as Tab;
  const base = `/products/${product.slug}`;

  // Shared data for the checklist and several tabs.
  const [packagesQ, pageQ, formQ, fieldsQ, waitlistCount, settingsQ, ordersCount] = await Promise.all([
    supabase.from("packages").select("*, package_features(label, included, sort_order)").eq("product_id", product.id).order("sort_order"),
    product.page_slug !== null ? supabase.from("pages").select("id, slug, title, is_published, page_sections(id, type, title, is_visible, sort_order)").eq("slug", product.page_slug).maybeSingle() : Promise.resolve({ data: null }),
    product.onboarding_form_id ? supabase.from("forms").select("id, title, version, form_steps(id, title, sort_order, form_fields(id, key, label, type, is_visible))").eq("id", product.onboarding_form_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("product_service_fields").select("*").eq("product_id", product.id).order("sort_order"),
    supabase.from("waitlist").select("id", { count: "exact", head: true }).eq("product_id", product.id),
    supabase.from("site_settings").select("currency_code").eq("id", 1).maybeSingle(),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("product_id", product.id),
  ]);
  const currency = settingsQ.data?.currency_code ?? "LKR";
  const packages = packagesQ.data ?? [];
  const page = pageQ.data;
  const form = formQ.data;
  const formSteps = [...(form?.form_steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const fieldCount = formSteps.reduce((n, s) => n + s.form_fields.filter((f) => f.is_visible).length, 0);
  const visibleSections = (page?.page_sections ?? []).filter((s) => s.is_visible).length;
  const others = (await supabase.from("products").select("name, color_light").neq("id", product.id)).data ?? [];
  const colorProblems = colorWarnings(product, others);

  const checklist: ChecklistItem[] = [
    { label: "At least one package shown on the website", done: packages.some((p) => p.is_visible && p.is_active) },
    { label: "Product page published with sections", done: Boolean(page?.is_published && visibleSections > 0) },
    { label: "Onboarding form with questions", done: fieldCount > 0 },
    { label: "Colours pass the contrast check", done: colorProblems.length === 0 },
    { label: "Service fields for setup", done: (fieldsQ.data ?? []).length > 0 },
  ];

  const statusInfo = statusBadge[product.status] ?? { tone: "neutral" as const, label: product.status };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/products", label: "Products" }}
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md" style={{ color: `var(--product-${product.slug})`, background: `var(--product-${product.slug}-soft)` }}>
              <ProductIcon name={product.icon} />
            </span>
            {product.name}
          </span>
        }
        description={product.tagline ?? undefined}
        chips={
          <>
            <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
            <Badge tone="neutral">{product.code}</Badge>
          </>
        }
        actions={
          <>
            {product.page_slug !== null && product.status !== "hidden" ? (
              <Button href={`${webUrl()}/${product.page_slug}`} variant="secondary" size="sm" target="_blank" iconAfter={<ExternalLink aria-hidden size={14} strokeWidth={1.5} />}>
                View on website
              </Button>
            ) : null}
            <Button href={`/requests/new?product=${product.id}`} size="sm">
              New request
            </Button>
          </>
        }
      />
      <LinkTabs
        label="Product sections"
        items={[
          ...tabs.slice(0, 1).map((t) => ({ href: base, label: t.label, active: !extra && tab === t.key })),
          { href: `/requests?product=${product.slug}`, label: "Requests", active: false, count: ordersCount.count ?? 0 },
          ...tabs.slice(1).map((t) => ({
            href: `${base}?tab=${t.key}`,
            label: t.label,
            active: tab === t.key,
            count: t.key === "packages" ? packages.length : t.key === "waitlist" ? (waitlistCount.count ?? 0) : null,
          })),
          ...extraTabs.map((t) => ({ href: `${base}?tab=${t.key}`, label: t.label, active: extra?.key === t.key })),
        ]}
      />

      {extra ? await extra.render({ staff, productId: product.id, productSlug: product.slug }) : null}

      {tab === "overview" && !extra ? <Overview supabase={supabase} productId={product.id} productSlug={product.slug} currency={currency} checklist={checklist} canManage={can(role, "manageProducts")} status={product.status} /> : null}

      {tab === "details" ? (
        <div className="flex flex-col gap-6">
          <ProductDetailsForm
            initial={{
              id: product.id,
              name: product.name,
              short_name: product.short_name,
              slug: product.slug,
              code: product.code,
              icon: product.icon ?? "",
              tagline: product.tagline ?? "",
              description: product.description ?? "",
              status: product.status,
              page_slug: product.page_slug ?? "",
              panel_url: product.panel_url ?? "",
              panel_live: product.panel_live,
              pay_online: product.pay_online,
              onboarding_form_id: product.onboarding_form_id ?? "",
              color_light: product.color_light,
              color_dark: product.color_dark,
              color_soft_light: product.color_soft_light,
              color_soft_dark: product.color_soft_dark,
            }}
            others={others}
            pages={(await supabase.from("pages").select("slug, title").order("title")).data ?? []}
            forms={(await supabase.from("forms").select("id, title").order("title")).data ?? []}
            hasOrders={(ordersCount.count ?? 0) > 0}
            checklist={checklist}
          />
          <ProductFeaturesEditor
            productId={product.id}
            features={((await supabase.from("product_features").select("*").eq("product_id", product.id).order("sort_order")).data ?? []).map((f) => ({
              id: f.id,
              icon: f.icon ?? "",
              title: f.title,
              description: f.description ?? "",
            }))}
          />
        </div>
      ) : null}

      {tab === "packages" ? (
        <PackagesManager
          productId={product.id}
          currency={currency}
          packages={await Promise.all(
            packages.map(async (p): Promise<PackageRow> => {
              const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("package_id", p.id);
              return {
                id: p.id,
                orders: count ?? 0,
                slug: p.slug,
                name: p.name,
                tagline: p.tagline ?? "",
                description: p.description ?? "",
                price_monthly: String(p.price_monthly),
                price_yearly: p.price_yearly === null ? "" : String(p.price_yearly),
                setup_fee: String(p.setup_fee),
                currency: p.currency ?? "",
                badge: p.badge ?? "",
                is_featured: p.is_featured,
                cta_label: p.cta_label ?? "",
                fine_print: p.fine_print ?? "",
                price_note: p.price_note ?? "",
                is_active: p.is_active,
                is_visible: p.is_visible,
                features: [...p.package_features].sort((a, b) => a.sort_order - b.sort_order).map((f, i) => ({ id: `f${i}`, label: f.label, included: f.included })),
              };
            }),
          )}
        />
      ) : null}

      {tab === "page" ? (
        page ? (
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="type-h2 text-ink">{page.title}</h2>
                <p className="type-small text-ink-muted">
                  /{page.slug} · {page.is_published ? "Published" : "Not published"} · {visibleSections} visible section{visibleSections === 1 ? "" : "s"}
                </p>
              </div>
              <Button href={`/website/pages/${page.id}`}>Edit page</Button>
            </div>
            <ol className="flex flex-col divide-y divide-line">
              {[...page.page_sections]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2">
                      <Badge tone="neutral">{s.type}</Badge>
                      <span className="type-body text-ink">{s.title || "Untitled"}</span>
                    </span>
                    {!s.is_visible ? <span className="type-small text-ink-muted">Hidden</span> : null}
                  </li>
                ))}
            </ol>
          </Card>
        ) : (
          <Alert tone="warning" title="No product page" action={can(role, "manageProducts") ? <Button href={`${base}?tab=details`} size="sm" variant="secondary">Choose a page</Button> : null}>
            Pick or create a page for this product so it can be shown on the website.
          </Alert>
        )
      ) : null}

      {tab === "form" ? (
        form ? (
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="type-h2 text-ink">{form.title}</h2>
                <p className="type-small text-ink-muted">
                  Version {form.version} · {formSteps.length} steps · {fieldCount} questions
                </p>
              </div>
              <Button href={`/forms/${form.id}`}>Open form builder</Button>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {formSteps.map((s, i) => (
                <li key={s.id} className="flex flex-col gap-2 rounded-md border border-line p-3">
                  <span className="type-label text-ink">
                    {i + 1}. {s.title}
                  </span>
                  <span className="type-small text-ink-muted">{s.form_fields.map((f) => f.label).join(", ") || "No questions"}</span>
                </li>
              ))}
            </ol>
          </Card>
        ) : (
          <Alert tone="warning" title="No onboarding form" action={<Button href={`${base}?tab=details`} size="sm" variant="secondary">Choose a form</Button>}>
            Customers can’t order until the product has an onboarding form.
          </Alert>
        )
      ) : null}

      {tab === "service-fields" ? (
        <ServiceFieldsEditor
          productId={product.id}
          statuses={(await supabase.from("order_statuses").select("key, label").order("sort_order")).data ?? []}
          fields={(fieldsQ.data ?? []).map((f) => ({
            id: f.id,
            key: f.key,
            label: f.label,
            type: f.type as ServiceField["type"],
            options: Array.isArray(f.options) ? (f.options as { value: string; label: string }[]) : [],
            help_text: f.help_text ?? "",
            visible_to_customer: f.visible_to_customer,
            required_for_status: f.required_for_status,
            is_visible: f.is_visible,
          }))}
        />
      ) : null}

      {tab === "actions" ? <ActionsTab supabase={supabase} productId={product.id} formFields={formSteps.flatMap((s) => s.form_fields)} serviceFields={fieldsQ.data ?? []} /> : null}

      {tab === "waitlist" ? <WaitlistTab supabase={supabase} productId={product.id} /> : null}

      {tab === "faqs" ? (
        <FaqsEditor
          productId={product.id}
          faqs={((await supabase.from("faqs").select("*").eq("product_id", product.id).order("sort_order")).data ?? []).map((f) => ({
            id: f.id,
            product_id: f.product_id,
            question: f.question,
            answer: f.answer,
            is_visible: f.is_visible,
          }))}
        />
      ) : null}
    </div>
  );
}

async function Overview({ supabase, productId, productSlug, currency, checklist, canManage, status }: { supabase: Db; productId: string; productSlug: string; currency: string; checklist: ChecklistItem[]; canManage: boolean; status: string }) {
  const [{ data: dash }, { data: recent }] = await Promise.all([
    supabase.rpc("admin_dashboard", { p_product_id: productId }),
    supabase.from("staff_orders").select("id, ref, status, status_label, status_tone, customer_name, customer_business, package_name, created_at").eq("product_id", productId).order("created_at", { ascending: false }).limit(8),
  ]);
  const d = (dash ?? {}) as Partial<Dashboard>;
  const done = checklist.filter((c) => c.done).length;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Waiting for you" value={d.waiting_for_action ?? 0} href={`/requests?product=${productSlug}`} tone={(d.waiting_for_action ?? 0) > 0 ? "warning" : "neutral"} />
        <StatCard label="Active subscriptions" value={d.active_subscriptions ?? 0} href={`/requests?product=${productSlug}&tab=active`} />
        <StatCard label="Monthly recurring" value={formatPrice(d.mrr ?? 0, currency)} hint="Yearly plans counted per month" />
        <StatCard label="Revenue (30 days)" value={formatPrice(d.revenue ?? 0, currency)} href={`/payments?product=${productSlug}`} />
        <StatCard label="New requests (30 days)" value={d.new_requests ?? 0} />
        <StatCard label="Renewals due (7 days)" value={d.renewals_due ?? 0} />
        <StatCard label="Overdue renewals" value={d.overdue_renewals ?? 0} tone={(d.overdue_renewals ?? 0) > 0 ? "danger" : "neutral"} />
        <StatCard label="Waitlist (30 days)" value={d.waitlist_signups ?? 0} href={`/products/${productSlug}?tab=waitlist`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card padded={false} className="self-start">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="type-h3 text-ink">Recent requests</h2>
            <Link href={`/requests?product=${productSlug}`} className="type-label text-link">
              All requests
            </Link>
          </div>
          {(recent ?? []).length ? (
            <ul className="divide-y divide-line">
              {(recent ?? []).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/requests/${encodeURIComponent(o.ref ?? "")}`} className="type-code text-link">
                      {o.ref}
                    </Link>
                    <span className="type-body text-ink">{o.customer_business || o.customer_name || "Deleted customer"}</span>
                    <OrderStatus label={o.status_label} tone={o.status_tone} fallback={o.status} />
                  </span>
                  <span className="type-small text-ink-muted">
                    {o.package_name} · {formatDate(o.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center type-body text-ink-muted">No requests yet.</p>
          )}
        </Card>
        <Card className="flex flex-col gap-3 self-start">
          <div className="flex items-center justify-between gap-2">
            <h2 className="type-h3 text-ink">Go-live checklist</h2>
            <span className="type-small text-ink-muted">
              {done}/{checklist.length}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-2 type-body">
                {c.done ? <CheckCircle2 aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" /> : <Circle aria-hidden size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-muted" />}
                <span className={c.done ? "text-ink" : "text-ink-muted"}>
                  <span className="sr-only">{c.done ? "Done: " : "To do: "}</span>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
          {canManage && status !== "live" ? (
            <Button href={`/products/${productSlug}?tab=details`} size="sm" variant="secondary" className="self-start">
              Change status
            </Button>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

async function ActionsTab({
  supabase,
  productId,
  formFields,
  serviceFields,
}: {
  supabase: Db;
  productId: string;
  formFields: { key: string; label: string }[];
  serviceFields: { key: string; label: string; type: string }[];
}) {
  const [{ data: actions }, { data: secretStatus }, { data: statuses }, { data: runs }] = await Promise.all([
    supabase.from("product_actions").select("*").eq("product_id", productId).order("sort_order"),
    supabase.rpc("admin_action_secret_status", { p_product_id: productId }),
    supabase.from("order_statuses").select("key, label").order("sort_order"),
    supabase.from("action_runs").select("id, action_label, status, error, created_at, orders!inner(ref, product_id)").eq("orders.product_id", productId).order("created_at", { ascending: false }).limit(15),
  ]);
  return (
    <ActionsEditor
      productId={productId}
      callbackUrl={`${adminUrl()}/api/n8n/callback`}
      secrets={(secretStatus ?? {}) as Record<string, SecretStatus>}
      statuses={statuses ?? []}
      payloadOptions={[
        ...formFields.map((f) => ({ value: f.key, label: `Answer: ${f.label}` })),
        ...serviceFields.map((f) => ({ value: f.key, label: `Setup: ${f.label}${f.type === "secret" ? " (secret)" : ""}` })),
      ].filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i)}
      runs={(runs ?? []).map((r) => ({
        id: r.id,
        action_label: r.action_label,
        status: r.status,
        error: r.error,
        created_at: r.created_at,
        order_ref: (r.orders as { ref?: string } | null)?.ref ?? null,
      }))}
      actions={(actions ?? []).map(
        (a): ProductActionRow & { id: string } => ({
          id: a.id,
          key: a.key,
          label: a.label,
          description: a.description ?? "",
          allowed_statuses: a.allowed_statuses,
          min_roles: a.min_roles as ProductActionRow["min_roles"],
          confirm_text: a.confirm_text ?? "",
          payload_fields: a.payload_fields,
          on_success_status: a.on_success_status,
          on_success_note: a.on_success_note ?? "",
          is_enabled: a.is_enabled,
        }),
      )}
    />
  );
}

async function WaitlistTab({ supabase, productId }: { supabase: Db; productId: string }) {
  const { data: entries } = await supabase.from("waitlist").select("id, email, created_at").eq("product_id", productId).order("created_at", { ascending: false }).limit(1000);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-h3 text-ink">
          {(entries ?? []).length} sign-up{(entries ?? []).length === 1 ? "" : "s"}
        </h2>
        <div className="flex gap-2">
          <Button href={`/api/export/waitlist?product=${productId}`} size="sm" variant="secondary" icon={<Download aria-hidden size={14} strokeWidth={1.5} />}>
            Export CSV
          </Button>
          <Button href={`/inbox?view=waitlist&product=${productId}`} size="sm" variant="ghost">
            Open in inbox
          </Button>
        </div>
      </div>
      {(entries ?? []).length ? (
        <ul className="flex flex-col divide-y divide-line">
          {(entries ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate type-body text-ink">{e.email}</span>
              <span className="type-small text-ink-muted">{formatDate(e.created_at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body text-ink-muted">No one has joined the waitlist yet.</p>
      )}
    </Card>
  );
}
