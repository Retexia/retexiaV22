import { AccountsForm } from "@/components/feeder/autopublish/accounts-form";
import { getAccount, requireAutopublishPage } from "@/lib/feeder/autopublish/data";
import { gatewayReady } from "@/lib/feeder/autopublish/gateway";

export const metadata = { title: "Autopublish accounts" };

export default async function AutopublishAccountsPage() {
  const { user } = await requireAutopublishPage("/autopublish/accounts");
  const account = await getAccount(user.id);
  return (
    <AccountsForm
      account={account}
      ready={gatewayReady()}
      metaBusinessId={process.env.RETEXIA_META_BUSINESS_ID?.trim() || null}
      tiktokBusinessCenterId={process.env.RETEXIA_TIKTOK_BC_ID?.trim() || null}
    />
  );
}
