import keys from "@retexia/content/string-keys.json";
import { PageHeader } from "@retexia/ui/admin";
import { StringsEditor, type StringRow } from "@/components/website/strings-editor";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Text and labels" };

export default async function StringsPage() {
  const { supabase } = await requireStaffPage("editContent");
  const { data } = await supabase.from("site_strings").select("key, value, description, updated_at").order("key").limit(5000);
  const db = new Map((data ?? []).map((r) => [r.key, r]));
  const code = new Map((keys as { key: string; fallback: string; file: string }[]).map((k) => [k.key, k]));
  const rows: StringRow[] = [
    ...[...code.values()].map((k) => {
      const row = db.get(k.key);
      return {
        key: k.key,
        fallback: k.fallback,
        file: k.file,
        value: row?.value ?? null,
        description: row?.description ?? null,
        state: !row ? ("missing" as const) : row.value === k.fallback ? ("default" as const) : ("changed" as const),
      };
    }),
    ...(data ?? [])
      .filter((r) => !code.has(r.key))
      .map((r) => ({ key: r.key, fallback: null, file: null, value: r.value, description: r.description, state: "unused" as const })),
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Text and labels" description="Every piece of fixed text on retexia.com (buttons, form messages, account pages). Change the wording here; no code needed." />
      <StringsEditor rows={rows} />
    </div>
  );
}
