import { PageHeader } from "@retexia/ui/admin";
import { MediaLibrary } from "@/components/website/media-library";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Media" };

export default async function MediaPage() {
  const { supabase } = await requireStaffPage("editContent");
  const { data } = await supabase.from("media").select("id, url, alt, mime, size, width, height, created_at").order("created_at", { ascending: false }).limit(500);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Media" description="Images for the website. Add alt text so screen readers can describe them. Files still used on a page can't be deleted." />
      <MediaLibrary items={data ?? []} />
    </div>
  );
}
