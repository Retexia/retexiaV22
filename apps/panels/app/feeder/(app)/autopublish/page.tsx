import { LaunchStudio } from "@/components/feeder/autopublish/launch-studio";
import { getAccount, launchProducts, listTemplates, requireAutopublishPage } from "@/lib/feeder/autopublish/data";
import { accountReady } from "@/lib/feeder/autopublish/runner";
import { feederDb } from "@/lib/feeder/db";
import { draftCreatives, getDraft } from "@/lib/feeder/drafts";
import type { StudioDraft } from "@/components/feeder/autopublish/launch-studio";

export const metadata = { title: "Autopublish" };

/** Launch: product + creatives + template → preview → Launch. */
export default async function AutopublishPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { user } = await requireAutopublishPage("/autopublish");
  const [{ template }, account, templates, products, { data: ads }] = await Promise.all([
    searchParams,
    getAccount(user.id),
    listTemplates(user.id),
    launchProducts(user.id),
    feederDb().from("meta_assets").select("asset_id, name, info, is_default").eq("user_id", user.id).eq("kind", "ad_account").eq("for_autopublish", true).eq("status", "ok"),
  ]);
  // Their draft (what they were setting up), with the uploaded files shown again.
  const saved = await getDraft<StudioDraft>(user.id, "autopublish").catch(() => null);
  const draft: StudioDraft | null = saved ? { ...saved.data, creatives: await draftCreatives(user.id, saved.data.creatives) } : null;
  return (
    <LaunchStudio
      draft={draft}
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
        adAccounts:
          account?.meta_via === "token"
            ? (ads ?? []).map((x) => ({ id: String(x.asset_id), name: (x.name as string | null) ?? `act_${x.asset_id}`, currency: ((x.info as { currency?: string | null }).currency ?? null), isDefault: Boolean(x.is_default) }))
            : [],
      }}
    />
  );
}
