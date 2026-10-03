import { can } from "@retexia/supabase";
import { PageHeader } from "@retexia/ui/admin";
import { NotificationsForm, type NotificationValue } from "@/components/settings/notifications-form";
import { requireStaffPage } from "@/lib/auth";
import { param, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { supabase, role } = await requireStaffPage("manageSettings");
  const filter = ["pending", "failed", "sent"].includes(param(sp, "status") ?? "") ? param(sp, "status")! : "all";
  let outboxQuery = supabase.from("notifications_outbox").select("id, event, channel, recipient, status, attempts, error, created_at, orders(ref)").order("created_at", { ascending: false }).limit(100);
  if (filter !== "all") outboxQuery = outboxQuery.eq("status", filter);
  const [{ data: s }, { data: outbox }, integration] = await Promise.all([
    supabase.from("staff_settings").select("*").eq("id", 1).maybeSingle(),
    outboxQuery,
    can(role, "manageTeam") ? supabase.rpc("admin_integration_status") : Promise.resolve({ data: { notifications_webhook_url: "set" } }),
  ]);
  const cfg = (s?.notification_settings ?? {}) as Record<string, { email?: boolean; whatsapp?: boolean } | string[]>;
  const ch = (k: string, def: { email: boolean; whatsapp: boolean }) => {
    const c = cfg[k];
    return c && !Array.isArray(c) ? { email: c.email ?? def.email, whatsapp: c.whatsapp ?? def.whatsapp } : def;
  };
  const initial: NotificationValue = {
    customer: {
      "order.created": ch("order.created", { email: true, whatsapp: false }),
      "order.status_changed": ch("order.status_changed", { email: true, whatsapp: true }),
      "payment.confirmed": ch("payment.confirmed", { email: true, whatsapp: false }),
    },
    staff_events: (Array.isArray(cfg.staff_events) ? cfg.staff_events : []).filter((e): e is NotificationValue["staff_events"][number] => ["order.created", "contact.created", "payment.proof_uploaded"].includes(e)),
    staff_notification_emails: s?.staff_notification_emails ?? "",
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Notifications" description="Who hears about what, and the queue of messages handed to n8n." />
      <NotificationsForm
        initial={initial}
        filter={filter}
        hasWebhook={Boolean((integration.data as { notifications_webhook_url?: string | null } | null)?.notifications_webhook_url)}
        outbox={(outbox ?? []).map((n) => ({ ...n, order_ref: (n.orders as { ref?: string } | null)?.ref ?? null }))}
      />
    </div>
  );
}
