import { can } from "@retexia/supabase";
import { PageHeader } from "@retexia/ui/admin";
import { PagesList } from "@/components/website/pages-list";
import { requireStaffPage } from "@/lib/auth";
import { webUrl } from "@/lib/env";

export const metadata = { title: "Pages" };

export default async function PagesPage() {
  const { supabase, role } = await requireStaffPage("editContent");
  const [{ data: pages }, { data: products }] = await Promise.all([
    supabase.from("pages").select("id, slug, title, is_published, show_in_sitemap, seo_title, seo_description, updated_at, product_id, page_sections(id)").order("slug"),
    supabase.from("products").select("id, name, page_slug").order("sort_order"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pages" description="Every page on retexia.com is built from sections. Product pages use the product's colour." />
      <PagesList
        webUrl={webUrl()}
        canDelete={can(role, "manageSettings")}
        products={(products ?? []).map((p) => ({ id: p.id, name: p.name }))}
        pages={(pages ?? []).map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          is_published: p.is_published,
          show_in_sitemap: p.show_in_sitemap,
          seo_ok: Boolean(p.seo_description),
          sections: p.page_sections.length,
          updated_at: p.updated_at,
          product: (products ?? []).find((x) => x.id === p.product_id)?.name ?? null,
          usedByProduct: (products ?? []).some((x) => x.page_slug === p.slug),
        }))}
      />
    </div>
  );
}
