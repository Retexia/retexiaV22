import { notFound } from "next/navigation";
import { LaunchView } from "@/components/feeder/autopublish/launch-view";
import { getAccount, getLaunch, requireAutopublishPage } from "@/lib/feeder/autopublish/data";

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  return { title: `Launch ${(await params).ref}` };
}

export default async function LaunchPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { user } = await requireAutopublishPage(`/autopublish/launches/${ref}`);
  const [data, account] = await Promise.all([getLaunch(user.id, ref), getAccount(user.id)]);
  if (!data) notFound();
  return <LaunchView {...data} ids={{ meta: account?.meta_ad_account_id ?? null, tiktok: account?.tiktok_advertiser_id ?? null }} />;
}
