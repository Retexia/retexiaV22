import { PageHeader } from "@retexia/ui/admin";
import { BotSettingsForm } from "@/components/lingo/bot-settings-form";
import { requireLingoPage } from "@/lib/lingo/session";

export const metadata = { title: "Bot settings" };

export default async function BotSettingsPage() {
  const { tenant, customer } = await requireLingoPage("/settings");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Bot settings" description={`How Lingo talks and follows up. Subscription ${customer.order.ref}.`} />
      <BotSettingsForm
        whatsapp={tenant.evolution_instance}
        initial={{
          business_name: tenant.business_name,
          staff_name: tenant.staff_name ?? "",
          owner_phone: tenant.owner_phone ?? "",
          default_language: tenant.default_language,
          content_language: tenant.content_language,
          followup_hours: String(tenant.followup_hours),
          delivery_days: String(tenant.delivery_days),
        }}
      />
    </div>
  );
}
