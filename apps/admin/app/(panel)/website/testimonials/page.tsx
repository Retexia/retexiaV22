import { PageHeader } from "@retexia/ui/admin";
import { TestimonialsEditor } from "@/components/website/content-editors";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Testimonials" };

export default async function TestimonialsPage() {
  const { supabase } = await requireStaffPage("editContent");
  const [{ data }, { data: products }] = await Promise.all([
    supabase.from("testimonials").select("*").order("sort_order"),
    supabase.from("products").select("id, name").order("sort_order"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Testimonials" description="Real quotes from customers, shown where a page has a testimonials section." />
      <TestimonialsEditor
        products={products ?? []}
        rows={(data ?? []).map((t) => ({
          id: t.id,
          quote: t.quote,
          author_name: t.author_name,
          author_role: t.author_role ?? "",
          company: t.company ?? "",
          avatar_url: t.avatar_url ?? "",
          product_id: t.product_id,
          is_visible: t.is_visible,
        }))}
      />
    </div>
  );
}
