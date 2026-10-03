import { PageHeader } from "@retexia/ui/admin";
import { FaqsEditor } from "@/components/website/faqs-editor";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "FAQs" };

export default async function FaqsPage() {
  const { supabase } = await requireStaffPage("editContent");
  const [{ data }, { data: products }] = await Promise.all([
    supabase.from("faqs").select("*").order("sort_order"),
    supabase.from("products").select("id, name").order("sort_order"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="FAQs" description="General questions and each product's own. A page's FAQ section shows the questions for its product." />
      <FaqsEditor
        products={products ?? []}
        faqs={(data ?? []).map((f) => ({ id: f.id, product_id: f.product_id, question: f.question, answer: f.answer, is_visible: f.is_visible }))}
      />
    </div>
  );
}
