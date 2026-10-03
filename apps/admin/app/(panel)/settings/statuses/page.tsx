import type { Tone } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { StatusesEditor, type TransitionRow } from "@/components/settings/statuses-editor";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Order statuses" };

export default async function StatusesPage() {
  const { supabase } = await requireStaffPage("manageSettings");
  const [{ data: statuses }, { data: transitions }, { data: orders }] = await Promise.all([
    supabase.from("order_statuses").select("*").order("sort_order"),
    supabase.from("order_status_transitions").select("*").order("sort_order"),
    supabase.from("orders").select("status").limit(20000),
  ]);
  const counts = (orders ?? []).reduce<Record<string, number>>((m, o) => ({ ...m, [o.status]: (m[o.status] ?? 0) + 1 }), {});
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Order statuses" description="The steps a request goes through, and which changes the team can make." />
      <StatusesEditor
        statuses={(statuses ?? []).map((s) => ({
          key: s.key,
          label: s.label,
          description: s.description ?? "",
          tone: s.tone as Tone,
          is_final: s.is_final,
          customer_can_cancel: s.customer_can_cancel,
          is_visible: s.is_visible,
          sort_order: s.sort_order,
          orders: counts[s.key] ?? 0,
        }))}
        transitions={(transitions ?? []).map((t) => ({
          id: t.id,
          from_status: t.from_status,
          to_status: t.to_status,
          action_label: t.action_label,
          min_roles: t.min_roles as TransitionRow["min_roles"],
          requires_confirmed_payment: t.requires_confirmed_payment,
          requires_reason: t.requires_reason,
          notify_customer_default: t.notify_customer_default,
          customer_note_template: t.customer_note_template ?? "",
        }))}
      />
    </div>
  );
}
