import { FIELD_TYPES, type FieldType, type ShowIf } from "@retexia/forms";
import { PageHeader } from "@retexia/ui/admin";
import { notFound } from "next/navigation";
import { FormBuilder, type StepDraft } from "@/components/forms/form-builder";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Form builder" };

export default async function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireStaffPage("manageProducts");
  const [{ data: form }, { data: locked }, { data: products }] = await Promise.all([
    supabase.from("forms").select("*, form_steps(*, form_fields(*))").eq("id", id).maybeSingle(),
    supabase.rpc("admin_form_locked_keys", { p_form_id: id }),
    supabase.from("products").select("name, slug").eq("onboarding_form_id", id),
  ]);
  if (!form) notFound();

  const steps: StepDraft[] = [...form.form_steps]
    .sort((a, b) => a.sort_order - b.sort_order || a.step_number - b.step_number)
    .map((s) => ({
      cid: s.id,
      id: s.id,
      title: s.title,
      description: s.description ?? "",
      is_visible: s.is_visible,
      fields: [...s.form_fields]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((f) => ({
          cid: f.id,
          id: f.id,
          key: f.key,
          label: f.label,
          type: ((FIELD_TYPES as readonly string[]).includes(f.type) ? f.type : "text") as FieldType,
          placeholder: f.placeholder ?? "",
          help_text: f.help_text ?? "",
          options: Array.isArray(f.options) ? (f.options as { value: string; label: string; description?: string | null }[]) : [],
          required: f.required,
          min: f.min === null ? "" : String(f.min),
          max: f.max === null ? "" : String(f.max),
          default_value: f.default_value ?? "",
          show_if: f.show_if && typeof f.show_if === "object" && !Array.isArray(f.show_if) ? (f.show_if as unknown as ShowIf) : null,
          width: f.width === "half" ? "half" : "full",
          prefill_from: f.prefill_from ?? "",
          is_visible: f.is_visible,
        })),
    }));
  const product = products?.[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={product ? { href: `/products/${product.slug}?tab=form`, label: product.name } : { href: "/forms", label: "Forms" }}
        title={form.title}
        description="Steps and questions customers answer after choosing a package. Drag questions between steps; preview before saving."
      />
      <FormBuilder
        meta={{
          id: form.id,
          slug: form.slug,
          product_id: form.product_id,
          title: form.title,
          description: form.description ?? "",
          submit_label: form.submit_label ?? "",
          success_title: form.success_title ?? "",
          success_message: form.success_message ?? "",
          version: form.version,
        }}
        steps={steps}
        lockedKeys={locked ?? []}
        usedBy={(products ?? []).map((p) => p.name)}
      />
    </div>
  );
}
