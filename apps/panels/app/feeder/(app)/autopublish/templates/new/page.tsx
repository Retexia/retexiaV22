import { TemplateEditor } from "@/components/feeder/autopublish/template-editor";
import { getAccount, requireAutopublishPage } from "@/lib/feeder/autopublish/data";
import { defaultTemplate } from "@/lib/feeder/autopublish/plan";

export const metadata = { title: "New template" };

export default async function NewTemplatePage() {
  const { user } = await requireAutopublishPage("/autopublish/templates/new");
  const account = await getAccount(user.id);
  const t = defaultTemplate();
  if (account?.tiktok_status === "connected" && account.meta_status !== "connected") t.platforms = ["tiktok"];
  return <TemplateEditor id={null} initial={t} currency={account?.currency ?? "LKR"} />;
}
