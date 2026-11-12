import { PageHeader } from "@retexia/ui/admin";
import { PlanSettingsForm } from "@/components/plan/plan-settings";
import { planWorkerReady } from "@/lib/plan/n8n";
import { requirePlanPage } from "@/lib/plan/session";

export const metadata = { title: "Reminders and settings" };

export default async function PlanSettingsPage() {
  const { settings } = await requirePlanPage("/settings");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reminders and settings" description="Small nudges that keep you consistent." />
      <PlanSettingsForm settings={settings} workerReady={planWorkerReady()} />
    </div>
  );
}
