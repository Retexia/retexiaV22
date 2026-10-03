import { can } from "@retexia/supabase";
import { Button, Card, EmptyState, ProductChip, cn, formatDate } from "@retexia/ui";
import { LinkTabs, PageHeader, Pagination } from "@retexia/ui/admin";
import { Download, Inbox as InboxIcon } from "lucide-react";
import Link from "next/link";
import { CopyEmails, MessagePanel, type Message } from "@/components/inbox/message-panel";
import { WaitlistRemove } from "@/components/inbox/waitlist-remove";
import { requireStaffPage } from "@/lib/auth";
import { PAGE_SIZE, ilike, listParams, param, withParams, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Inbox" };

const STATUSES = [
  { key: "new", label: "New" },
  { key: "read", label: "Read" },
  { key: "replied", label: "Replied" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
] as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const staff = await requireStaffPage("view");
  const { supabase, role } = staff;
  const view = param(sp, "view") === "waitlist" ? "waitlist" : "messages";
  const status = (param(sp, "status") ?? "new") as (typeof STATUSES)[number]["key"];
  const { page, from, to } = listParams(sp, { id: "created_at", desc: true });
  const q = param(sp, "q");

  const counts = Object.fromEntries(
    await Promise.all(
      STATUSES.map(async (s) => {
        let query = supabase.from("contact_messages").select("id", { count: "exact", head: true });
        if (s.key !== "all") query = query.eq("status", s.key);
        const { count } = await query;
        return [s.key, count ?? 0] as const;
      }),
    ),
  ) as Record<string, number>;
  const { count: waitlistCount } = await supabase.from("waitlist").select("id", { count: "exact", head: true });

  const header = (
    <>
      <PageHeader title="Inbox" description="Contact form messages and waitlist sign-ups." />
      <LinkTabs
        label="Inbox sections"
        items={[
          { href: "/inbox", label: "Messages", active: view === "messages", count: counts.new },
          { href: "/inbox?view=waitlist", label: "Waitlist", active: view === "waitlist", count: waitlistCount ?? 0 },
        ]}
      />
    </>
  );

  if (view === "waitlist") {
    const productFilter = param(sp, "product");
    const [products, entries] = await Promise.all([
      supabase.from("products").select("id, slug, short_name, status").order("sort_order"),
      (() => {
        let query = supabase.from("waitlist").select("id, email, created_at, product_id").order("created_at", { ascending: false }).limit(5000);
        if (productFilter) query = query.eq("product_id", productFilter);
        return query;
      })(),
    ]);
    const byProduct = new Map<string, { id: string; email: string; created_at: string }[]>();
    for (const e of entries.data ?? []) byProduct.set(e.product_id, [...(byProduct.get(e.product_id) ?? []), e]);
    const shownProducts = (products.data ?? []).filter((p) => byProduct.has(p.id) || p.status === "coming_soon");
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex flex-wrap items-center gap-2">
          <Button href={`/api/export/waitlist${productFilter ? `?product=${productFilter}` : ""}`} variant="secondary" size="sm" icon={<Download aria-hidden size={14} strokeWidth={1.5} />}>
            Export CSV
          </Button>
          <CopyEmails emails={(entries.data ?? []).map((e) => e.email)} />
        </div>
        {shownProducts.length ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {shownProducts.map((p) => {
              const list = byProduct.get(p.id) ?? [];
              return (
                <Card key={p.id} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <ProductChip slug={p.slug} name={p.short_name} size="sm" />
                    <span className="type-label text-ink-muted">
                      {list.length} sign-up{list.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {list.length ? (
                    <ul className="flex max-h-96 flex-col divide-y divide-line overflow-y-auto">
                      {list.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="truncate type-body text-ink">{e.email}</span>
                          <span className="flex items-center gap-2 type-small text-ink-muted">
                            {formatDate(e.created_at)}
                            {can(role, "manageSettings") ? <WaitlistRemove id={e.id} /> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="type-body text-ink-muted">No sign-ups yet.</p>
                  )}
                  <div className="flex gap-2">
                    <Button href={`/api/export/waitlist?product=${p.id}`} variant="ghost" size="sm">
                      Export
                    </Button>
                    <CopyEmails emails={list.map((e) => e.email)} />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No waitlists" icon={<InboxIcon aria-hidden size={24} strokeWidth={1.5} />}>
            Waitlists appear for products that are “coming soon”.
          </EmptyState>
        )}
      </div>
    );
  }

  let listQuery = supabase.from("contact_messages").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (status !== "all") listQuery = listQuery.eq("status", status);
  if (q) listQuery = listQuery.or(`name.ilike.${ilike(q)},email.ilike.${ilike(q)},message.ilike.${ilike(q)},business_name.ilike.${ilike(q)}`);
  const { data: messages, count } = await listQuery.range(from, to);

  const openId = param(sp, "open") ?? messages?.[0]?.id;
  let open = messages?.find((m) => m.id === openId) ?? null;
  if (!open && openId) {
    const { data } = await supabase.from("contact_messages").select("*").eq("id", openId).maybeSingle();
    open = data;
  }
  let openMessage: Message | null = null;
  if (open) {
    const [{ data: customer }, { data: product }] = await Promise.all([
      open.user_id
        ? supabase.from("profiles").select("id").eq("id", open.user_id).maybeSingle()
        : supabase.from("profiles").select("id").eq("email", open.email.toLowerCase()).maybeSingle(),
      open.product_id ? supabase.from("products").select("short_name").eq("id", open.product_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    openMessage = {
      id: open.id,
      name: open.name,
      email: open.email,
      phone: open.phone,
      business_name: open.business_name,
      subject: open.subject,
      message: open.message,
      status: open.status,
      source_path: open.source_path,
      created_at: open.created_at,
      product: product?.short_name ?? null,
      customerId: customer?.id ?? null,
    };
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Message status" className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Link
              key={s.key}
              href={withParams("/inbox", sp, { status: s.key === "new" ? null : s.key, open: null })}
              aria-current={status === s.key ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-full px-3 type-label transition-hover focus-visible:focus-ring",
                status === s.key ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-surface-sunk hover:text-ink",
              )}
            >
              {s.label}
              <span className="type-small">{counts[s.key]}</span>
            </Link>
          ))}
        </nav>
        <form method="get" action="/inbox" className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input
            name="q"
            type="search"
            data-table-search
            defaultValue={q}
            aria-label="Search messages"
            placeholder="Search messages"
            className="h-9 w-56 rounded-full border border-line-strong bg-surface-raised px-3 type-body text-ink focus-visible:border-brand focus-visible:focus-ring"
          />
          <Button href={`/api/export/messages?status=${status === "all" ? "" : status}`} variant="secondary" size="sm" icon={<Download aria-hidden size={14} strokeWidth={1.5} />}>
            CSV
          </Button>
        </form>
      </div>
      {messages?.length ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <Card padded={false} className="self-start overflow-hidden">
            <ul className="divide-y divide-line">
              {messages.map((m) => (
                <li key={m.id}>
                  <Link
                    href={withParams("/inbox", sp, { open: m.id, page })}
                    aria-current={m.id === open?.id ? "true" : undefined}
                    className={cn(
                      "flex flex-col gap-0.5 px-4 py-3 transition-hover hover:bg-surface-sunk focus-visible:focus-ring",
                      m.id === open?.id && "bg-brand-soft/60",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate type-label", m.status === "new" ? "text-ink" : "text-ink-muted")}>
                        {m.status === "new" ? <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full bg-brand" /> : null}
                        {m.name}
                      </span>
                      <span className="shrink-0 type-small text-ink-muted">{formatDate(m.created_at)}</span>
                    </span>
                    <span className="truncate type-small text-ink-muted">{m.subject || m.message}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-3 py-2">
              <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(p) => withParams("/inbox", sp, { page: p, open: null })} />
            </div>
          </Card>
          {openMessage ? <MessagePanel key={openMessage.id} message={openMessage} canOperate={can(role, "operate")} canDelete={can(role, "manageSettings")} /> : null}
        </div>
      ) : (
        <EmptyState title={status === "new" ? "No new messages. Nice." : "No messages here"} icon={<InboxIcon aria-hidden size={24} strokeWidth={1.5} />}>
          Messages from the contact forms on retexia.com land here.
        </EmptyState>
      )}
    </div>
  );
}
