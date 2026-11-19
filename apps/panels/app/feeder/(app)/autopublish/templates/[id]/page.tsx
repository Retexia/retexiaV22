import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/feeder/autopublish/template-editor";
import { getAccount, getTemplate, requireAutopublishPage } from "@/lib/feeder/autopublish/data";

export const metadata = { title: "Edit template" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireAutopublishPage(`/autopublish/templates/${id}`);
  const [t, account] = await Promise.all([getTemplate(user.id, id), getAccount(user.id)]);
  if (!t) notFound();
  return <TemplateEditor id={t.id} initial={t.data} currency={account?.currency ?? "LKR"} />;
}
