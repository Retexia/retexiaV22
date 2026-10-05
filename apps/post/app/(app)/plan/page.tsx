import { PageHeader } from "@retexia/ui/admin";
import { PlanEditor } from "@/components/plan-editor";
import { mediaUrls } from "@/lib/media";
import { PLAN_LIMITS } from "@/lib/plans";
import { requireBusinessPage } from "@/lib/session";
import { addDays, dayLabel, localDate } from "@/lib/time";

export const metadata = { title: "Week plan and offers" };

export default async function PlanPage() {
  const { business, settings, db } = await requireBusinessPage("/plan");
  const today = localDate(business.timezone);
  const end = addDays(today, 6);
  const [{ data: notes }, { data: offers }, { data: library }] = await Promise.all([
    db.from("plan_items").select("*").eq("business_id", business.id).eq("type", "week_note").gte("start_date", today).lte("start_date", end),
    db.from("plan_items").select("*").eq("business_id", business.id).eq("type", "offer").gte("end_date", addDays(today, -30)).order("start_date", { ascending: false }),
    db.from("media").select("id, storage_path, thumb_path, description").eq("business_id", business.id).eq("kind", "photo").order("created_at", { ascending: false }).limit(60),
  ]);
  const thumbs = await mediaUrls(db, library ?? []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Week plan and offers" description="Steer what gets posted. Offers come first, then your notes for a slot, then the AI's own ideas." />
      <PlanEditor
        today={today}
        weekPlanAllowed={PLAN_LIMITS[business.plan].weekPlan}
        weekPlanEnabled={settings.week_plan_enabled}
        slots={settings.slots}
        days={Array.from({ length: 7 }, (_, i) => {
          const d = addDays(today, i);
          return { date: d, label: dayLabel(d, today) };
        })}
        notes={(notes ?? []).map((n) => ({ id: n.id, date: n.start_date, slot: n.slot ?? 1, note: n.note ?? "", format: n.format, media_id: n.media_id }))}
        offers={(offers ?? []).map((o) => {
          const d = (o.details ?? {}) as { title?: string; price?: string | null; discount?: string | null };
          return { id: o.id, title: d.title ?? "", details: o.note ?? "", price: d.price ?? "", discount: d.discount ?? "", start_date: o.start_date, end_date: o.end_date, slots_per_day: o.slots_per_day ?? 1, media_id: o.media_id, active: o.active };
        })}
        library={(library ?? []).map((m) => ({ id: m.id, url: thumbs.get(m.id) ?? null, description: m.description }))}
      />
    </div>
  );
}
