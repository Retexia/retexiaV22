import { PageHeader } from "@retexia/ui/admin";
import { LibraryGrid } from "@/components/post/library-grid";
import { mediaUrls } from "@/lib/post/media";
import { requireBusinessPage } from "@/lib/post/session";

export const metadata = { title: "Photo library" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { business, db } = await requireBusinessPage("/library");
  const product = typeof sp.product === "string" && /^[0-9a-f-]{36}$/i.test(sp.product) ? sp.product : null;
  let q = db.from("media").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(300);
  if (product) q = q.eq("product_id", product);
  if (sp.source === "upload" || sp.source === "ai") q = q.eq("source", sp.source);
  const [{ data: media }, { data: products }] = await Promise.all([q, db.from("products").select("id, name").eq("business_id", business.id).order("name")]);
  const urls = await mediaUrls(db, media ?? []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Photo library" description="Your real photos come first: the AI picks from here before designing anything new. Tag each photo with its product so the right one is used." />
      <LibraryGrid
        products={products ?? []}
        filter={{ product, source: typeof sp.source === "string" ? sp.source : null }}
        items={(media ?? []).map((m) => ({
          id: m.id,
          url: urls.get(m.id) ?? null,
          kind: m.kind,
          source: m.source,
          product_id: m.product_id,
          description: m.description ?? "",
          tags: m.tags,
          last_used_at: m.last_used_at,
          created_at: m.created_at,
        }))}
      />
    </div>
  );
}
