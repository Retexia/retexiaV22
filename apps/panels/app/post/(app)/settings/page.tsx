import { PageHeader } from "@retexia/ui/admin";
import { SettingsForm } from "@/components/post/settings-form";
import { PLAN_LIMITS } from "@/lib/post/plans";
import { requireBusinessPage } from "@/lib/post/session";
import { whatsAppConfigured } from "@/lib/post/whatsapp";

export const metadata = { title: "Playlist and settings" };

export default async function SettingsPage() {
  const { business, settings, customer } = await requireBusinessPage("/settings");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Playlist and settings" description={`${PLAN_LIMITS[business.plan].label} plan · subscription ${customer.order.ref}`} />
      <SettingsForm
        whatsAppReady={whatsAppConfigured()}
        limits={PLAN_LIMITS[business.plan]}
        basics={{ name: business.name, category: business.category ?? "", country: business.country, timezone: business.timezone, languages: business.languages }}
        settings={settings}
      />
    </div>
  );
}
