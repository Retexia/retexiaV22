import { PageHeader } from "@retexia/ui/admin";
import { GatewayKeysForm } from "@/components/settings/gateway-keys-form";
import { IntegrationsForm, type IntegrationStatus } from "@/components/settings/integrations-form";
import { requireStaffPage } from "@/lib/auth";
import { adminUrl } from "@/lib/env";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const { supabase } = await requireStaffPage("manageTeam");
  const { data } = await supabase.rpc("admin_integration_status");
  const { data: keys } = await supabase.rpc("admin_gateway_keys");
  const status = (data ?? { has_callback_secret: false, callback_secret_hint: null, notifications_webhook_url: null, updated_at: null }) as IntegrationStatus;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Integrations" description="n8n secrets and webhooks. Owners only; secrets are stored in a private table and never sent to the browser after saving." />
      <IntegrationsForm status={status} callbackUrl={`${adminUrl()}/api/n8n/callback`} />
      <GatewayKeysForm saved={(keys ?? {}) as Record<string, string>} />
    </div>
  );
}
