import { PageHeader } from "@retexia/ui/admin";
import { SettingsForm } from "@/components/post/settings-form";
import { PLAN_LIMITS } from "@/lib/post/plans";
import { requireBusinessPage } from "@/lib/post/session";
import { localDate } from "@/lib/time";
import { whatsAppConfigured } from "@/lib/post/whatsapp";

export const metadata = { title: "Playlist and settings" };

export default async function SettingsPage() {
  const { business, settings, customer, db } = await requireBusinessPage("/settings");
  const today = localDate(business.timezone);
  const [{ count: products }, { count: offers }] = await Promise.all([
    db.from("products").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("active", true),
    db.from("plan_items").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("type", "offer").eq("active", true).gte("end_date", today),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Playlist and settings" description={`${PLAN_LIMITS[business.plan].label} plan · subscription ${customer.order.ref}`} />
      <SettingsForm
        whatsAppReady={whatsAppConfigured()}
        canTestWhatsApp={whatsAppConfigured()}
        limits={PLAN_LIMITS[business.plan]}
        basics={{ name: business.name, category: business.category ?? "", country: business.country, timezone: business.timezone, languages: business.languages }}
        settings={settings}
        topics={{ products: products ?? 0, offers: offers ?? 0 }}
      />
    </div>
  );
}
