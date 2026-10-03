import { Card, EmptyState, formatDate } from "@retexia/ui";
import { PageHeader } from "@retexia/ui/admin";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { NewFormButton } from "@/components/forms/new-form-button";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Forms" };

export default async function FormsPage() {
  const { supabase } = await requireStaffPage("manageProducts");
  const [{ data: forms }, { data: products }] = await Promise.all([
    supabase.from("forms").select("id, title, version, updated_at, form_steps(form_fields(id))").order("title"),
    supabase.from("products").select("id, name, onboarding_form_id").order("sort_order"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Onboarding forms" description="Each product points to one form. Edit questions here or from the product's Onboarding form tab." actions={<NewFormButton products={(products ?? []).map((p) => ({ id: p.id, name: p.name }))} />} />
      {(forms ?? []).length ? (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {(forms ?? []).map((f) => {
              const usedBy = (products ?? []).filter((p) => p.onboarding_form_id === f.id).map((p) => p.name);
              const questions = f.form_steps.reduce((n, s) => n + s.form_fields.length, 0);
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex flex-col gap-0.5">
                    <Link href={`/forms/${f.id}`} className="type-label text-ink hover:text-brand">
                      {f.title}
                    </Link>
                    <span className="type-small text-ink-muted">
                      {f.form_steps.length} steps · {questions} questions · version {f.version} · {usedBy.length ? `used by ${usedBy.join(", ")}` : "not used by a product"}
                    </span>
                  </div>
                  <span className="type-small text-ink-muted">Updated {formatDate(f.updated_at)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState title="No forms yet" icon={<ListChecks aria-hidden size={24} strokeWidth={1.5} />}>
          Forms are created with new products, or here.
        </EmptyState>
      )}
    </div>
  );
}
