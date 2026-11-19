import { LaunchStudio } from "@/components/feeder/autopublish/launch-studio";
import { getAccount, launchProducts, listTemplates, requireAutopublishPage } from "@/lib/feeder/autopublish/data";
import { accountReady } from "@/lib/feeder/autopublish/runner";

export const metadata = { title: "Autopublish" };

/** Launch: product + creatives + template → preview → Launch. */
export default async function AutopublishPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { user } = await requireAutopublishPage("/autopublish");
  const [{ template }, account, templates, products] = await Promise.all([searchParams, getAccount(user.id), listTemplates(user.id), launchProducts(user.id)]);
  return (
    <LaunchStudio
      initialTemplate={typeof template === "string" ? template : null}
      templates={templates.filter((t) => t.is_active).map((t) => ({ id: t.id, data: t.data }))}
      products={products}
      account={{
        currency: account?.currency ?? "LKR",
        meta: accountReady(account, "meta"),
        tiktok: accountReady(account, "tiktok"),
        metaStatus: account?.meta_status ?? "none",
        tiktokStatus: account?.tiktok_status ?? "none",
        metaForms: account?.meta_info?.forms ?? [],
        tiktokForms: (account?.tiktok_info?.forms ?? []).map((f) => ({ id: f.id, name: f.name })),
        privacy: Boolean(account?.privacy_policy_url),
      }}
    />
  );
}
