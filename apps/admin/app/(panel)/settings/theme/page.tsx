import { PageHeader } from "@retexia/ui/admin";
import { colorTokens, lengthTokens } from "@retexia/ui/tokens";
import { ThemeEditor } from "@/components/settings/theme-editor";
import { requireStaffPage } from "@/lib/auth";

export const metadata = { title: "Theme" };

export default async function ThemePage() {
  const { supabase } = await requireStaffPage("manageSettings");
  const { data } = await supabase.from("site_settings").select("theme").eq("id", 1).single();
  const raw = (data?.theme ?? {}) as Record<string, unknown>;
  // Only colour tokens are edited here; a plain string means the same colour in both modes.
  const initial: Record<string, { light?: string; dark?: string }> = {};
  const lengths: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k in lengthTokens && typeof v === "string") lengths[k] = v;
    if (!(k in colorTokens)) continue;
    if (typeof v === "string") initial[k] = { light: v, dark: v };
    else if (v && typeof v === "object") initial[k] = v as { light?: string; dark?: string };
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Theme" description="The website's colours in light and dark mode. Product colours are set on each product." />
      <ThemeEditor initial={initial} lengths={lengths} />
    </div>
  );
}
