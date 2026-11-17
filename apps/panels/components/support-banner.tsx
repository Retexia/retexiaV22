import { LifeBuoy } from "lucide-react";
import { ACCESS_STATUSES } from "@/lib/customer";
import { publicDb } from "@/lib/plan/db";
import { getSupport } from "@/lib/support";

const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Support mode: always on screen while a Retexia admin works in a customer's
 * panels — whose account this is, until when, the customer's other panels,
 * and "End". Nothing here for customers.
 */
export async function SupportBanner() {
  const s = await getSupport();
  if (!s) return null;
  const db = publicDb();
  const [{ data: orders }, { data: plan }] = await Promise.all([
    db.from("orders").select("product_id").eq("user_id", s.customerId).in("status", ACCESS_STATUSES),
    db.from("products").select("id").eq("slug", "plan").maybeSingle(),
  ]);
  const ids = [...new Set([...(orders ?? []).map((o) => o.product_id as string), ...(plan ? [plan.id as string] : [])])];
  const { data: products } = ids.length ? await db.from("products").select("short_name, panel_url, panel_live, sort_order").in("id", ids).order("sort_order") : { data: [] };
  const panels = (products ?? []).filter((p) => p.panel_live && p.panel_url) as { short_name: string; panel_url: string }[];

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-2.5 text-ink shadow-lg sm:inset-x-4"
    >
      <LifeBuoy aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-warning" />
      <p className="min-w-0 flex-1 type-small">
        <strong className="type-label">Support mode:</strong> you are in <strong className="type-label">{s.customerName}</strong>&apos;s account as {s.staffName}. Changes are saved to their account. Ends {time(s.expiresAt)}.
      </p>
      <nav aria-label="This customer's panels" className="flex flex-wrap items-center gap-1">
        {panels.map((p) => (
          <a key={p.panel_url} href={p.panel_url} className="rounded-full px-2.5 py-1 type-small text-ink hover:bg-surface focus-visible:focus-ring">
            {p.short_name}
          </a>
        ))}
        <a href="/support/end" className="rounded-full bg-ink px-3 py-1 type-label text-surface hover:opacity-90 focus-visible:focus-ring">
          End
        </a>
      </nav>
    </div>
  );
}
