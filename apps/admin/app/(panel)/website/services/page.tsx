import { PageHeader } from "@retexia/ui/admin";
import { ServicesEditor } from "@/components/website/content-editors";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Services" };

export default async function ServicesPage() {
  const { supabase } = await requireStaffPage("editContent");
  const { data } = await supabase.from("services").select("*").order("sort_order");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Services" description="Custom work shown in the services section (websites, apps, automations). Drag to reorder." />
      <ServicesEditor
        rows={(data ?? []).map((s) => ({ id: s.id, title: s.title, description: s.description ?? "", icon: s.icon ?? "", href: s.href ?? "", is_visible: s.is_visible }))}
      />
    </div>
  );
}
