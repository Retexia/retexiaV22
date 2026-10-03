import { sectionSchemas, sectionTypes } from "@retexia/content";
import { PageHeader } from "@retexia/ui/admin";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageEditor, type SectionRow } from "@/components/website/page-editor";
import type { JsonSchema } from "@/components/website/schema-form";
import { requireStaffPage } from "@/lib/auth";
import { webUrl } from "@/lib/env";

export const metadata = { title: "Edit page" };

/** JSON schema of every section type (input side: defaults are optional). */
const schemas = Object.fromEntries(sectionTypes.map((t) => [t, z.toJSONSchema(sectionSchemas[t], { io: "input", unrepresentable: "any" }) as JsonSchema]));

export default async function EditPagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireStaffPage("editContent");
  const [{ data: page }, { data: sections }, { data: products }, { data: settings }] = await Promise.all([
    supabase.from("pages").select("*").eq("id", id).maybeSingle(),
    supabase.from("page_sections").select("*").eq("page_id", id).order("sort_order").order("created_at"),
    supabase.from("products").select("id, slug, name").order("sort_order"),
    supabase.from("site_settings").select("site_name, seo_title_template").eq("id", 1).maybeSingle(),
  ]);
  if (!page) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back={{ href: "/website/pages", label: "Pages" }} title={page.title} description={page.slug ? `/${page.slug}` : "Home page"} />
      <PageEditor
        webUrl={webUrl()}
        siteName={settings?.site_name ?? "Retexia"}
        titleTemplate={settings?.seo_title_template ?? "%s · Retexia"}
        schemas={schemas}
        products={products ?? []}
        page={{
          id: page.id,
          slug: page.slug,
          title: page.title,
          seo_title: page.seo_title ?? "",
          seo_description: page.seo_description ?? "",
          og_image_url: page.og_image_url ?? "",
          is_published: page.is_published,
          show_in_sitemap: page.show_in_sitemap,
          product_id: page.product_id ?? "",
        }}
        sections={(sections ?? []).map(
          (s): SectionRow => ({
            id: s.id,
            type: s.type,
            eyebrow: s.eyebrow ?? "",
            title: s.title ?? "",
            highlight: s.highlight ?? "",
            subtitle: s.subtitle ?? "",
            anchor: s.anchor ?? "",
            background: s.background === "sunk" ? "sunk" : "surface",
            content: s.content && typeof s.content === "object" && !Array.isArray(s.content) ? (s.content as Record<string, unknown>) : {},
            is_visible: s.is_visible,
          }),
        )}
      />
    </div>
  );
}
