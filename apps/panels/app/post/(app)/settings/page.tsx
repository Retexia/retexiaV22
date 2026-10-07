import { PageHeader } from "@retexia/ui/admin";
import { SettingsForm } from "@/components/post/settings-form";
import { SENSITIVE } from "@/lib/post/options";
import { PLAN_LIMITS } from "@/lib/post/plans";
import { requireBusinessPage } from "@/lib/post/session";

export const metadata = { title: "Schedule and settings" };

export default async function SettingsPage() {
  const { business, settings, customer } = await requireBusinessPage("/settings");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Schedule and settings" description={`${PLAN_LIMITS[business.plan].label} plan · subscription ${customer.order.ref}`} />
      <SettingsForm
        sensitive={SENSITIVE.includes(business.category ?? "")}
        weekPlanAllowed={PLAN_LIMITS[business.plan].weekPlan}
        basics={{ name: business.name, category: business.category ?? "", country: business.country, timezone: business.timezone, languages: business.languages }}
        settings={settings}
      />
    </div>
  );
}
